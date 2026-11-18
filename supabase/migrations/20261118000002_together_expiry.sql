-- A host that crashes never sets ended_at, so its session would stay joinable forever.
-- Sessions older than 12 hours now count as ended everywhere the server decides "active".
-- (Same bodies as 20261118000000_together_private.sql / 20261118000001_together_invite.sql plus the created_at check.)

create or replace function public.session_lookup(p_code text) returns table (id uuid, host uuid)
language sql stable security definer set search_path = '' as $$
  select s.id, s.host from public.sessions s where s.code = p_code and s.ended_at is null
    and s.created_at > now() - interval '12 hours' and (select auth.uid()) is not null
$$;

create or replace function public.together_access(p_topic text) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p_topic = 'together:' || s.code then
      case when s.host = (select auth.uid()) then 'host'
           when exists (select 1 from public.session_members m where m.session_id = s.id and m.user_id = (select auth.uid())) then 'listener' end
    when p_topic = 'together:' || s.code || ':lobby' and (select auth.uid()) is not null then 'lobby'
  end
  from public.sessions s
  where s.ended_at is null and s.created_at > now() - interval '12 hours' and s.code = split_part(p_topic, ':', 2)
$$;

create or replace function public.together_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sessions s where s.ended_at is null and s.created_at > now() - interval '12 hours' and (s.host = (select auth.uid())
    or exists (select 1 from public.session_members m where m.session_id = s.id and m.user_id = (select auth.uid()))))
$$;

create or replace function public.together_send(p_code text, p_event text, p_payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  s public.sessions;
  is_host boolean;
  is_member boolean;
  topic text;
  bkt text;
  lim int;
  win interval;
  used int;
begin
  select * into s from public.sessions where code = p_code and ended_at is null and created_at > now() - interval '12 hours';
  if me is null or s.id is null then raise exception 'No session with that code' using errcode = '42501'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload) > 65536 then
    raise exception 'Bad payload' using errcode = '22023';
  end if;
  is_host := s.host = me;
  is_member := exists (select 1 from public.session_members where session_id = s.id and user_id = me);
  topic := 'together:' || s.code;
  case
    when p_event = 'join-req' and not is_host then topic := topic || ':lobby';
    when p_event = 'join-ans' and is_host then topic := topic || ':lobby';
    when p_event in ('now', 'library', 'queued') and is_host then null;
    when p_event in ('chat', 'end') and (is_host or is_member) then null;   -- `end` from a listener means "I left"
    when p_event in ('queue-req', 'library-req') and is_member then null;
    when p_event = 'rtc' and is_host
      and exists (select 1 from public.session_members where session_id = s.id and user_id::text = p_payload->>'to') then null;
    when p_event = 'rtc' and is_member and p_payload->>'to' = s.host::text then null;
    else raise exception 'Not allowed' using errcode = '42501';
  end case;

  -- Simple fixed-window limits per sender and session.
  bkt := case when p_event in ('chat', 'queue-req', 'library-req', 'join-req') then p_event else 'other' end;
  select v.l, v.w into lim, win from (values
    ('chat', 10, interval '10 seconds'), ('queue-req', 1, interval '2 seconds'), ('library-req', 1, interval '10 seconds'),
    ('join-req', 3, interval '1 minute'), ('other', 600, interval '10 seconds')) v(b, l, w) where v.b = bkt;
  insert into public.together_rate as r (session_id, user_id, bucket, window_start, n) values (s.id, me, bkt, now(), 1)
  on conflict (session_id, user_id, bucket) do update set
    n = case when r.window_start < now() - win then 1 else r.n + 1 end,
    window_start = case when r.window_start < now() - win then now() else r.window_start end
  returning n into used;
  if used > lim then raise exception 'Slow down' using errcode = 'P0001', hint = 'rate'; end if;

  perform realtime.send(p_payload || jsonb_build_object('from', me), p_event, topic, true);
end $$;

create or replace function public.together_invite(p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  s public.sessions;
  used int;
begin
  select * into s from public.sessions where host = me and ended_at is null and created_at > now() - interval '12 hours';
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
