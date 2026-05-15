import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xyxpyljufhnwuqmpqbxx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5eHB5bGp1Zmhud3VxbXBxYnh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NTA1NTYsImV4cCI6MjA4OTMyNjU1Nn0.mYtOR0ViQ20ZCBwOGHmvjgVn0QrpMLAca_gRyL2cfkM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchUsers() {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nome, email, perfil, ativo, criado_em')
    .eq('ativo', true);

  if (error) {
    console.error('Error fetching users:', error);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

fetchUsers();
