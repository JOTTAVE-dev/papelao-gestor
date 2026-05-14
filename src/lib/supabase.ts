import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function isConfigured(value: string | undefined, placeholders: string[]) {
  if (!value) return false;
  return !placeholders.some((placeholder) => value.includes(placeholder));
}

export const hasSupabaseConfig =
  isConfigured(supabaseUrl, ['missing-project', 'seu-projeto']) &&
  isConfigured(supabaseAnonKey, ['missing-anon-key', 'sua-chave-anon-publica']);

export const supabase = createClient(
  supabaseUrl || 'https://missing-project.supabase.co',
  supabaseAnonKey || 'missing-anon-key',
);
