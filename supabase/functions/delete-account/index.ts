// Permanently deletes the calling user's account: storage files, table rows,
// then the auth user. Required by App Store guideline 5.1.1(v).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { importPKCS8, SignJWT } from 'npm:jose@5';

const BUCKETS = ['recordings', 'videos'];
const TABLES_BY_USER = ['recordings', 'videos', 'sessions'];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Revoke the user's Sign in with Apple tokens (required by Apple when an account is
 * deleted). Needs a Sign in with Apple key: APPLE_TEAM_ID, APPLE_KEY_ID,
 * APPLE_PRIVATE_KEY (the .p8 contents) and APPLE_CLIENT_ID (the bundle ID).
 * Returns a short status for logging; never throws.
 */
async function revokeApple(authorizationCode: string): Promise<string> {
  const teamId = Deno.env.get('APPLE_TEAM_ID');
  const keyId = Deno.env.get('APPLE_KEY_ID');
  const privateKey = Deno.env.get('APPLE_PRIVATE_KEY');
  const clientId = Deno.env.get('APPLE_CLIENT_ID');
  if (!teamId || !keyId || !privateKey || !clientId) return 'skipped: Apple key not configured';
  try {
    const key = await importPKCS8(privateKey.replace(/\\n/g, '\n'), 'ES256');
    const clientSecret = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: keyId })
      .setIssuer(teamId)
      .setIssuedAt()
      .setExpirationTime('5m')
      .setAudience('https://appleid.apple.com')
      .setSubject(clientId)
      .sign(key);
    const form = (body: Record<string, string>) => ({
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });
    const tokenRes = await fetch(
      'https://appleid.apple.com/auth/token',
      form({ client_id: clientId, client_secret: clientSecret, code: authorizationCode, grant_type: 'authorization_code' })
    );
    const tokens = await tokenRes.json().catch(() => ({}));
    const token = tokens.refresh_token ?? tokens.access_token;
    if (!token) return `token exchange failed (${tokenRes.status})`;
    const revokeRes = await fetch(
      'https://appleid.apple.com/auth/revoke',
      form({
        client_id: clientId,
        client_secret: clientSecret,
        token,
        token_type_hint: tokens.refresh_token ? 'refresh_token' : 'access_token',
      })
    );
    return revokeRes.ok ? 'revoked' : `revoke failed (${revokeRes.status})`;
  } catch (err) {
    return `revoke error: ${err instanceof Error ? err.message : String(err)}`;
  }
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

  const body = await req.json().catch(() => ({}));
  if (typeof body?.appleAuthorizationCode === 'string' && body.appleAuthorizationCode) {
    console.log('[delete-account] apple', await revokeApple(body.appleAuthorizationCode));
  }

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
