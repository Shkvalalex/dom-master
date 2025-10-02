// src/scenarios.ts
import { addHours } from 'date-fns';
import { generateHour } from './generator.js';
import type { Reading } from './types.js';

export type Season = 'WINTER' | 'SUMMER';
export type Scenario = 'SEASON_BASE' | 'MINOR_DRIFT' | 'PERSISTENT_DRIFT';
export type Mode = 'REALTIME' | 'BATCH_DAY' | 'BATCH_WEEK';

export type HouseProfile = {
  house_id: string;
  scheme: 'circulation' | 'dead_end';
  base_m3_h: number;
  noise_pct?: number;
  night_factor?: number;
  peak_factor?: number;
};

export function makeSeasonProfile(
  base: Omit<HouseProfile, 'base_m3_h'> & { base_m3_h?: number },
  season: Season
): HouseProfile {
  const seasonalK = season === 'WINTER' ? 1.25 : 0.85;

  return {
    house_id: base.house_id,
    scheme: base.scheme,
    base_m3_h: Math.max(0.2, (base.base_m3_h ?? 8) * seasonalK),
    noise_pct: base.noise_pct ?? 0.08,
    night_factor: base.night_factor ?? 0.8,
    peak_factor: base.peak_factor ?? 1.3,
  };
}


function applyDriftToITP(readings: Reading[], driftPct: number): Reading[] {
  if (!driftPct) return readings;
  const k = 1 + driftPct / 100;
  return readings.map(r => {
    if (r.src === 'ITP_CW') {
      return { ...r, volume_m3: round3(r.volume_m3 * k) };
    }
    return r;
  });
}

function round3(x: number) { return Math.round(x * 1000) / 1000; }


function driftPlan(scenario: Scenario, start: Date, totalHours: number): Array<{ from: Date; to: Date; driftPct: number }> {
  const plan: Array<{ from: Date; to: Date; driftPct: number }> = [];

  if (scenario === 'SEASON_BASE') {
    plan.push({ from: start, to: addHours(start, totalHours), driftPct: 0 });
    return plan;
  }

  if (scenario === 'MINOR_DRIFT') {
    const chunk = Math.max(6, Math.floor(totalHours / 6));
    let t = new Date(start);
    while (t < addHours(start, totalHours)) {
      const t2 = addHours(t, chunk);
      plan.push({ from: t, to: t2, driftPct: 10 }); 
      t = addHours(t2, Math.floor(chunk / 2));      
    }
    return plan;
  }

  if (scenario === 'PERSISTENT_DRIFT') {
    const fullTo = addHours(start, totalHours);
    plan.push({ from: start, to: fullTo, driftPct: 30 }); 
    return plan;
  }


  plan.push({ from: start, to: addHours(start, totalHours), driftPct: 0 });
  return plan;
}


export function generateRangeWithScenario(
  profile: HouseProfile,
  start: Date,
  hours: number,
  scenario: Scenario
): Reading[] {
  const out: Reading[] = [];
  const plan = driftPlan(scenario, start, hours);

  const driftFor = (ts: Date) => {
    for (const seg of plan) {
      if (ts >= seg.from && ts < seg.to) return seg.driftPct;
    }
    return 0;
  };

  let t = new Date(start);
  for (let i = 0; i < hours; i++) {
    const base = generateHour(profile, t);
    const withDrift = applyDriftToITP(base, driftFor(t));
    out.push(...withDrift);
    t = addHours(t, 1);
  }
  return out;
}
