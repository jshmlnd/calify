// The PKCE code from an OAuth callback: a query ('?code=…'), a full URL ('calify://auth?code=…') or the error Supabase sent back.
export function codeFrom(s) {
  const p = new URL(s || '', 'http://127.0.0.1').searchParams
  const code = p.get('code')
  if (!code) throw new Error(p.get('error_description') || 'Sign-in was cancelled')
  return code
}
