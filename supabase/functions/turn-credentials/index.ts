// Mints short-lived Cloudflare TURN credentials for signed-in Calify users (Listen together relay fallback).
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  // The gateway already checked the JWT signature; the anon key is a JWT too, so also require a real user.
  const user = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
    headers: { Authorization: req.headers.get('Authorization') ?? '', apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
  })
  if (!user.ok) return json({ error: 'Sign in to listen together' }, 401)

  const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${Deno.env.get('CF_TURN_KEY_ID')}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('CF_TURN_API_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: 14400 }),
  })
  if (!r.ok) return json({ error: 'Relay unavailable' }, 502)
  const { iceServers } = await r.json()
  // Cloudflare's advice: browsers stall on the port-53 URLs, so drop them.
  const servers = [].concat(iceServers).map((s: { urls: string | string[] }) => ({ ...s, urls: [].concat(s.urls as never).filter((u: string) => !/:53(\?|$)/.test(u)) }))
  return json({ iceServers: servers })
})
