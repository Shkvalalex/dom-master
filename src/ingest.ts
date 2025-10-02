// src/ingest.ts
import { getClient } from './supabase.js';
import type { Reading } from './types.js';

export async function ingestReadings(rows: Reading[]): Promise<Reading[]> {
  if (!rows.length) return rows;
  const supa = getClient();
  const { data, error } = await supa
    .from('jkh_readings')
    .upsert(rows, { onConflict: 'ts,house_id,src', ignoreDuplicates: false })
    .select();
  if (error) throw error;
  return data ?? [];
}
