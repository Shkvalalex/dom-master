// src/index.ts
import 'dotenv/config';
import express from 'express';
import { addHours, subHours } from 'date-fns';

import { getClient } from './supabase.js';
import { ingestReadings } from './ingest.js';
import { makeSeasonProfile, generateRangeWithScenario } from './scenarios.js';
import type { Mode, Scenario, Season } from './scenarios.js';

import apiV1 from './api_v1.js';

// Swagger UI
import swaggerUi from 'swagger-ui-express';
import { openapiProd } from './openapi_prod.js';
import { openapiDemo } from './openapi_demo.js';

const app = express();
app.set('etag', false);
app.use(express.json({ limit: '1mb' }));

// ===== v1 REST =====
app.use('/v1', apiV1);

// ===== OpenAPI JSON (no-store + deep clone во избежание мутаций) =====
app.get('/openapi.prod.json', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(JSON.parse(JSON.stringify(openapiProd)));
});

app.get('/openapi.demo.json', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(JSON.parse(JSON.stringify(openapiDemo)));
});

// маленький middleware, чтобы Swagger HTML тоже не кешировался
const noStore = (_req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.set('Cache-Control', 'no-store');
  next();
};

// ===== ДВА независимых Swagger UI (используем только swaggerUrl) =====
app.use(
  '/docs/prod',
  noStore,
  swaggerUi.serve,
  swaggerUi.setup(undefined, {
    explorer: true,
    customSiteTitle: 'Dom Monitor — PROD API',
    swaggerUrl: '/openapi.prod.json',
  })
);

app.use(
  '/docs/demo',
  noStore,
  swaggerUi.serve,
  swaggerUi.setup(undefined, {
    explorer: true,
    customSiteTitle: 'Dom Monitor — DEMO API',
    swaggerUrl: '/openapi.demo.json',
  })
);

// ===== Симулятор (demo endpoint) =====
async function refreshAndDetect(house_id: string, hours = 48) {
  const supa = getClient();
  await supa.rpc('jkh_refresh_views');
  await supa.rpc('jkh_detect_anomalies', { p_house: house_id, p_hours: hours, p_threshold: 10 });
}

function hoursForMode(mode: Mode) {
  switch (mode) {
    case 'BATCH_DAY': return 24;
    case 'BATCH_WEEK': return 24 * 7;
    default: return 1; // REALTIME — генерим час за тик
  }
}

app.post('/simulate/run', async (req, res) => {
  try {
    const { house_id, season, scenario, mode, hours } = req.body as {
      house_id: string;
      season?: Season;
      scenario?: Scenario;
      mode?: Mode;
      hours?: number;
      step_sec?: number;
      iterations?: number;
    };

    if (!house_id) return res.status(400).json({ error: 'house_id required' });

    const seasonSafe: Season = season ?? 'WINTER';
    const scenarioSafe: Scenario = scenario ?? 'SEASON_BASE';
    const modeSafe: Mode = mode ?? 'BATCH_DAY';

    const supa = getClient();
    const { data: house, error } = await supa
      .from('jkh_houses')
      .select('id, scheme_type')
      .eq('id', house_id)
      .maybeSingle();
    if (error || !house) throw new Error('house not found');

    const profile = makeSeasonProfile(
      {
        house_id,
        scheme: (house.scheme_type as 'circulation' | 'dead_end') ?? 'circulation',
        base_m3_h: 8,
      },
      seasonSafe
    );

    // === Realtime ===
    if (modeSafe === 'REALTIME') {
      const iterations = req.body?.iterations ?? 10;
      const stepSec = req.body?.step_sec ?? 5;

      let insertedTotal = 0;
      for (let i = 0; i < iterations; i++) {
        const ts = new Date();
        const readings = generateRangeWithScenario(profile, ts, 1, scenarioSafe);
        const inserted = await ingestReadings(readings);
        insertedTotal += inserted.length;

        await refreshAndDetect(house_id, 24);

        if (i < iterations - 1) {
          await new Promise((r) => setTimeout(r, stepSec * 1000));
        }
      }

      return res.json({
        ok: true,
        mode: modeSafe,
        season: seasonSafe,
        scenario: scenarioSafe,
        iterations,
        step_sec: stepSec,
        inserted: insertedTotal,
        started_at: new Date().toISOString(),
      });
    }

    // === Пакетные режимы ===
    const now = new Date();
    const totalHours = hours ?? hoursForMode(modeSafe);
    const start = subHours(now, totalHours);

    const readings = generateRangeWithScenario(profile, start, totalHours, scenarioSafe);
    const inserted = await ingestReadings(readings);
    await refreshAndDetect(house_id, Math.min(totalHours, 168));

    res.json({
      ok: true,
      mode: modeSafe,
      season: seasonSafe,
      scenario: scenarioSafe,
      inserted: inserted.length,
      from: start.toISOString(),
      to: addHours(start, totalHours).toISOString(),
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || 'internal error' });
  }
});

const port = process.env.PORT || 8787;
app.listen(port, () => {
  console.log(`Simulator API listening on :${port}`);
});
