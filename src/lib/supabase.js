import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.MODE === 'development'
  ? "http://localhost:5173/supabase"
  : import.meta.env.VITE_SUPABASE_URL;

export const supabase = createClient(
  supabaseUrl,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
