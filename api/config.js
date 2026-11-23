// Public browser configuration only. Never put the Supabase service-role key here.
module.exports = (_request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    response.status(503).json({ error: 'Falta configurar SUPABASE_URL y SUPABASE_ANON_KEY en Vercel.' });
    return;
  }
  response.status(200).json({ url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });
};
