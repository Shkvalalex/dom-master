import { addHours } from 'date-fns';
import type { Reading } from './types.js';

/** Параметры дома для генерации */
export type HouseProfile = {
  house_id: string;
  scheme: 'circulation' | 'dead_end'; // 2-канальный/1-канальный ОДПУ
  base_m3_h: number;                  // базовый расход м³/час
  noise_pct?: number;                 // случайный шум ±%
  night_factor?: number;              // 0..1 — ночью тише
  peak_factor?: number;               // 1..X — утром/вечером выше
};

/** Паттерн спроса: ночь, день, пик */
function demandMultiplier(d: Date) {
  const h = d.getUTCHours(); // можно использовать локальную TZ, если хочешь
  if (h >= 6 && h <= 9) return 1.25;     // утро-пик
  if (h >= 18 && h <= 22) return 1.3;    // вечер-пик
  if (h >= 0 && h <= 5) return 0.7;      // ночь
  return 1.0;                            // плато
}

function jitter(val: number, pct = 0.1) {
  const k = 1 + (Math.random() * 2 - 1) * pct;
  return Math.max(0, val * k);
}

/** Генерация часового среза */
export function generateHour(profile: HouseProfile, ts: Date): Reading[] {
  const mult = demandMultiplier(ts);
  const night = (ts.getUTCHours() >= 0 && ts.getUTCHours() <= 5);
  const base = profile.base_m3_h
    * (night ? (profile.night_factor ?? 0.8) : 1)
    * (mult > 1 ? (profile.peak_factor ?? mult) : mult);

  const noise = profile.noise_pct ?? 0.08;

  // Одно место истины — «истинный» потреблённый объём за час
  const trueConsumption = jitter(base, noise);

  // ITP: считаем, что близок к trueConsumption, но добавим небольшой дрейф
  const itp = jitter(trueConsumption, noise * 0.6);

  // ISO-строка для записи в Reading
  const tsIso = ts.toISOString();

  // ODPU: в зависимости от схемы
  if (profile.scheme === 'circulation') {
    // 2 канала: подача/обратка
    const supply = jitter(trueConsumption * 1.15, noise);
    const ret    = Math.max(0, supply - trueConsumption + jitter(0.0, 0.02));
    return [
      { ts: tsIso, house_id: profile.house_id, src: 'ITP_CW',           volume_m3: round3(itp) },
      { ts: tsIso, house_id: profile.house_id, src: 'ODPU_SUPPLY',      volume_m3: round3(supply) },
      { ts: tsIso, house_id: profile.house_id, src: 'ODPU_RETURN',      volume_m3: round3(ret) },
    ];
  } else {
    // тупиковая — один канал потребления
    const one = jitter(trueConsumption, noise);
    return [
      { ts: tsIso, house_id: profile.house_id, src: 'ITP_CW',           volume_m3: round3(itp) },
      { ts: tsIso, house_id: profile.house_id, src: 'ODPU_CONSUMPTION', volume_m3: round3(one) },
    ];
  }
}

export function generateRange(profile: HouseProfile, from: Date, hours: number): Reading[] {
  const out: Reading[] = [];
  let t = new Date(from);
  for (let i = 0; i < hours; i++) {
    out.push(...generateHour(profile, t));
    t = addHours(t, 1);
  }
  return out;
}

function round3(x: number) { return Math.round(x * 1000) / 1000; }
