-- Listen together invites (spec Goal 8: an Invite from the host counts as pre-approved).
-- * user:<id> is a private Realtime channel only that user can read. Nobody broadcasts on it directly
--   (no INSERT policy); together_invite() is the only sender.
-- * together_invite(target): the caller must host an active session and follow the target. It adds the target's
--   session_members row (the pre-approval; the 4-listener cap still applies) and sends { code, from } on
--   user:<target>, with `from` stamped here.

create policy "invites: read your own user channel" on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and (select realtime.topic()) = 'user:' || (select auth.uid())::text);

create function public.together_invite(p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  s public.sessions;
  used int;
begin
  select * into s from public.sessions where host = me and ended_at is null;
  if me is null or s.id is null then raise exception 'Start a session first' using errcode = '42501'; end if;
  if p_target is null or p_target = me or not exists (select 1 from public.follows where follower = me and followee = p_target) then
    raise exception 'You can only invite people you follow' using errcode = '42501';
  end if;

  -- 10 invites a minute per host and session (same fixed window as together_send).
  insert into public.together_rate as r (session_id, user_id, bucket, window_start, n) values (s.id, me, 'invite', now(), 1)
  on conflict (session_id, user_id, bucket) do update set
    n = case when r.window_start < now() - interval '1 minute' then 1 else r.n + 1 end,
    window_start = case when r.window_start < now() - interval '1 minute' then now() else r.window_start end
  returning n into used;
  if used > 10 then raise exception 'Slow down' using errcode = 'P0001', hint = 'rate'; end if;

  insert into public.session_members (session_id, user_id) values (s.id, p_target) on conflict do nothing;
  perform realtime.send(jsonb_build_object('code', s.code, 'from', me), 'invite', 'user:' || p_target, true);
end $$;

revoke execute on function public.together_invite(uuid) from public, anon;
grant execute on function public.together_invite(uuid) to authenticated;
