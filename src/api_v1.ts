// src/api_v1.ts
import express from 'express';
import { z } from 'zod';
import { ingestReadings } from './ingest.js';
import { getClient } from './supabase.js';

const router = express.Router();

/** --- simple auth (Bearer) --- */
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const hdr = req.header('authorization') || req.header('Authorization') || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
  const allowed = (process.env.API_KEYS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!token || !allowed.includes(token)) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } });
  }
  next();
}

/** --- validators --- */
const ReadingSchema = z.object({
  house_id: z.string().uuid(),
  ts: z.string().datetime(), // ISO8601
  src: z.enum(['ITP_CW','ODPU_SUPPLY','ODPU_RETURN','ODPU_CONSUMPTION']),
  volume_m3: z.number().min(0).max(100000)
});

const BatchSchema = z.object({
  items: z.array(ReadingSchema).min(1).max(1000)
});

/** вспомогательные проверки */
function assertHourBoundary(tsIso: string) {
  const d = new Date(tsIso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
}

/** health */
router.get('/healthz', (_req, res) => {
  res.type('application/json').send({ ok: true, ts: new Date().toISOString() });
});

// --- ДОБАВИТЬ В src/api_v1.ts (после импортов/схем) ---
const DashboardHeadSchema = z.object({
  house_id: z.string().uuid().optional().nullable(),
  p_range: z.tuple([z.string().datetime(), z.string().datetime()]).optional(),
  p_period: z.string().optional().default('30 дней'),
  p_realtime: z.boolean().optional().default(false),
  p_window_hours: z.number().int().min(1).max(168).optional().default(6),
  p_granularity: z.enum(['auto','hour','day','week','month']).optional().default('auto'),
  p_tz: z.string().optional().default('Europe/Moscow'),
  p_max_points: z.number().int().min(10).max(2000).optional().default(400),
  p_heat_days_max: z.number().int().min(1).max(31).optional().default(12),
  p_active_days: z.number().int().min(1).max(365).optional().default(30),
  p_min_rows: z.number().int().min(1).max(1000).optional().default(24),
  p_limit: z.number().int().min(1).max(200).optional().default(10),
  p_important: z.array(z.string()).optional().nullable(),
});

router.post('/dashboard/head', requireAuth, async (req, res) => {
  try {
    const p = DashboardHeadSchema.parse(req.body);
    const supa = getClient();
    const { data, error } = await supa.rpc('jkh_get_dashboard_head', {
      p_house: p.house_id ?? null,
      p_range: p.p_range ?? null,
      p_period: p.p_period,
      p_realtime: p.p_realtime,
      p_window_hours: p.p_window_hours,
      p_granularity: p.p_granularity,
      p_tz: p.p_tz,
      p_max_points: p.p_max_points,
      p_heat_days_max: p.p_heat_days_max,
      p_active_days: p.p_active_days,
      p_min_rows: p.p_min_rows,
      p_limit: p.p_limit,
      p_important: p.p_important ?? null,
    });
    if (error) return res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } });
    return res.json(data);
  } catch (e: any) {
    if (e?.issues) return res.status(422).json({ error: { code: 'VALIDATION_ERROR', details: e.issues } });
    console.error(e);
    return res.status(500).json({ error: { code: 'INTERNAL', message: e?.message || 'internal error' } });
  }
});

// --- ДОБАВИТЬ В src/api_v1.ts ---
const ListAnomaliesSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  severity: z.array(z.enum(['info','warn','critical'])).optional(),
  limit: z.number().int().min(1).max(500).optional().default(50),
  offset: z.number().int().min(0).max(10_000).optional().default(0),
  order: z.enum(['asc','desc']).optional().default('desc'),
});

router.post('/anomalies/:house_id', requireAuth, async (req, res) => {
  try {
    const house_id = z.string().uuid().parse(req.params.house_id);
    const p = ListAnomaliesSchema.parse(req.body ?? {});
    const supa = getClient();

    let q = supa.from('jkh_anomalies')
      .select('*')
      .eq('house_id', house_id);

    if (p.from) q = q.gte('ts', p.from);
    if (p.to)   q = q.lt('ts', p.to);
    if (p.severity?.length) q = q.in('severity', p.severity);

    q = q.order('ts', { ascending: p.order === 'asc' }).range(p.offset, p.offset + p.limit - 1);

    const { data, error, count } = await q;
    if (error) return res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } });

    return res.json({ items: data ?? [], limit: p.limit, offset: p.offset, total: count ?? undefined });
  } catch (e: any) {
    if (e?.issues) return res.status(422).json({ error: { code: 'VALIDATION_ERROR', details: e.issues } });
    console.error(e);
    return res.status(500).json({ error: { code: 'INTERNAL', message: e?.message || 'internal error' } });
  }
});


/** single reading */
router.post('/readings', requireAuth, async (req, res) => {
  try {
    const parsed = ReadingSchema.parse(req.body);
    if (!assertHourBoundary(parsed.ts)) {
      return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'ts must be at the top of the hour (mm:ss.SSS = 00:00.000)' } });
    }

    // дополнительно проверим, что дом существует
    const supa = getClient();
    const { data: house } = await supa.from('jkh_houses').select('id').eq('id', parsed.house_id).maybeSingle();
    if (!house) {
      return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'house_id not found' } });
    }

    // у нас уже есть ingestReadings — он делает upsert по (ts,house_id,src)
    const inserted = await ingestReadings([parsed]);
    // inserted.length = 1 на representation, не различаем insert/update
    return res.status(200).json({
      status: 'upserted',
      upserted: inserted.length,
      conflict_key: [parsed.ts, parsed.house_id, parsed.src]
    });
  } catch (e: any) {
    if (e?.issues) {
      return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: e.issues } });
    }
    console.error(e);
    return res.status(500).json({ error: { code: 'INTERNAL', message: e?.message || 'internal error' } });
  }
});

/** batch readings */
router.post('/readings/batch', requireAuth, async (req, res) => {
  try {
    const parsed = BatchSchema.parse(req.body);

    // валидация часов
// валидация часов
for (let i = 0; i < parsed.items.length; i++) {
  const item = parsed.items[i];
  if (!item) continue; // на всякий случай
  if (!assertHourBoundary(item.ts)) {
    return res.status(422).json({
      error: { code: 'VALIDATION_ERROR', message: `items[${i}].ts must be at the top of the hour` }
    });
  }
}

    const supa = getClient();
    const houseIds = Array.from(new Set(parsed.items.map(i => i.house_id)));
    const { data: known } = await supa.from('jkh_houses').select('id').in('id', houseIds);
    const knownSet = new Set((known || []).map(x => x.id));
    const unknown = houseIds.filter(id => !knownSet.has(id));
    if (unknown.length) {
      return res.status(422).json({
        error: { code: 'VALIDATION_ERROR', message: `Unknown house_id(s): ${unknown.join(', ')}` }
      });
    }

    const upserted = await ingestReadings(parsed.items);
    return res.status(202).json({
      ok: true,
      received: parsed.items.length,
      upserted: upserted.length,
      errors: []
    });
  } catch (e: any) {
    if (e?.issues) {
      return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: e.issues } });
    }
    console.error(e);
    return res.status(500).json({ error: { code: 'INTERNAL', message: e?.message || 'internal error' } });
  }
});

export default router;
