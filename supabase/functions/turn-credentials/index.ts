// Mints short-lived Cloudflare TURN credentials for the host or a member of an active Listen together session.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    // The gateway checked the JWT signature; together_active() is false for the anon key, outsiders and ended sessions.
    const r0 = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/together_active`, {
      method: 'POST',
      headers: { Authorization: req.headers.get('Authorization') ?? '', apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '', 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!r0.ok || (await r0.json()) !== true) return json({ error: 'Only people in a Listen together session can use the relay' }, 403)

    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${Deno.env.get('CF_TURN_KEY_ID')}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('CF_TURN_API_TOKEN')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 7200 }),
    })
    if (!r.ok) return json({ error: 'Relay unavailable' }, 502)
    const { iceServers } = await r.json()
    // Cloudflare's advice: browsers stall on the port-53 URLs, so drop them.
    const servers = [].concat(iceServers).map((s: { urls: string | string[] }) => ({ ...s, urls: [].concat(s.urls as never).filter((u: string) => !/:53(\?|$)/.test(u)) }))
    return json({ iceServers: servers })
  } catch {
    return json({ error: 'Relay unavailable' }, 500)
  }
})
