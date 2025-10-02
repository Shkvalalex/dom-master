
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url) throw new Error('SUPABASE_URL env var is required');
  if (!key) throw new Error('SUPABASE_ANON_KEY env var is required');

  client = createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { 'X-Client-Info': 'jkh-simulator/1.0' } },
  });

  return client;
}
