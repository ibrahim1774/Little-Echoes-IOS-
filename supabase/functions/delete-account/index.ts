// Permanently deletes the calling user's account: storage files, table rows,
// then the auth user. Required by App Store guideline 5.1.1(v).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const BUCKETS = ['recordings', 'videos'];
const TABLES_BY_USER = ['recordings', 'videos', 'sessions'];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Not signed in' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // Identify the caller from their own token — never from the request body.
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: 'Not signed in' }, 401);
  const userId = userData.user.id;

  for (const bucket of BUCKETS) {
    // Files live at <userId>/<file>; page through until the folder is empty.
    for (;;) {
      const { data: files, error } = await admin.storage.from(bucket).list(userId, { limit: 1000 });
      if (error) return json({ error: `Could not list ${bucket}: ${error.message}` }, 500);
      if (!files || files.length === 0) break;
      const { error: removeError } = await admin.storage
        .from(bucket)
        .remove(files.map((f) => `${userId}/${f.name}`));
      if (removeError) return json({ error: `Could not delete ${bucket}: ${removeError.message}` }, 500);
      if (files.length < 1000) break;
    }
  }

  for (const table of TABLES_BY_USER) {
    const { error } = await admin.from(table).delete().eq('user_id', userId);
    if (error) return json({ error: `Could not delete ${table}: ${error.message}` }, 500);
  }

  const { error: profileError } = await admin.from('profiles').delete().eq('id', userId);
  if (profileError) return json({ error: `Could not delete profile: ${profileError.message}` }, 500);

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) return json({ error: `Could not delete account: ${deleteError.message}` }, 500);

  return json({ ok: true });
});
