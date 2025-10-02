// src/maintenance.ts
import { getClient } from './supabase.js';

export async function detectAnomalies(): Promise<{ ok: true; found: number }> {


  return { ok: true, found: 0 };
}

export async function refreshMaterializedView(viewName = 'mv_house_stats'):
  Promise<{ ok: true }> {

  return { ok: true };
}
