import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "/supabase",
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
