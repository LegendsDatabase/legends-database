import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY
);

// 👇 AGGIUNGI QUESTO
if (typeof window !== 'undefined') {
  window.supabase = supabase;
}