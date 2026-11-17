-- Clients only ever end a session; every other column is immutable for them (RLS policy "sessions: host ends" still applies).
revoke update on public.sessions from authenticated;
grant update (ended_at) on public.sessions to authenticated;
