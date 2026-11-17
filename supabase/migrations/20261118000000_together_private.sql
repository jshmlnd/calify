-- Listen together, enforced on the server (spec Goal 8: until the host allows you in, you get no audio, chat or library).
-- * session_members: who the host let in (host writes; max 4 listeners).
-- * sessions are no longer listable: session_lookup(code) answers for one exact code.
-- * together:CODE is a private Realtime channel readable only by the host and members; together:CODE:lobby carries
--   join requests/answers for any signed-in user while the session is active.
-- * Clients never broadcast directly (no INSERT policy for broadcast): together_send() checks the role, rate-limits,
--   and stamps `from` with auth.uid().

-- ---------- members
create table public.session_members (
  session_id uuid not null references public.sessions on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  primary key (session_id, user_id)
);
alter table public.session_members enable row level security;
revoke all on public.session_members from anon;
create policy "session_members: host adds" on public.session_members for insert to authenticated
  with check (exists (select 1 from public.sessions s where s.id = session_id and s.host = (select auth.uid()) and s.ended_at is null));
create policy "session_members: host removes" on public.session_members for delete to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_id and s.host = (select auth.uid())));
create policy "session_members: host or the member reads" on public.session_members for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.sessions s where s.id = session_id and s.host = (select auth.uid())));

-- 4 listeners + the host = 5. The row lock on the session serializes concurrent inserts.
create function public.session_members_cap() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.sessions where id = new.session_id for update;
  if (select count(*) from public.session_members where session_id = new.session_id) >= 4 then
    raise exception 'Session is full' using errcode = 'P0001', hint = 'full';
  end if;
  return new;
end $$;
create trigger session_members_cap before insert on public.session_members for each row execute function public.session_members_cap();

-- ---------- sessions: no more listing; the host still reads its own rows
drop policy "sessions: signed-in read" on public.sessions;
create policy "sessions: host reads own" on public.sessions for select to authenticated using (host = (select auth.uid()));

create function public.session_lookup(p_code text) returns table (id uuid, host uuid)
language sql stable security definer set search_path = '' as $$
  select s.id, s.host from public.sessions s where s.code = p_code and s.ended_at is null and (select auth.uid()) is not null
$$;

-- 'host' | 'listener' on together:CODE, 'lobby' on together:CODE:lobby, else null. Only active sessions.
create function public.together_access(p_topic text) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p_topic = 'together:' || s.code then
      case when s.host = (select auth.uid()) then 'host'
           when exists (select 1 from public.session_members m where m.session_id = s.id and m.user_id = (select auth.uid())) then 'listener' end
    when p_topic = 'together:' || s.code || ':lobby' and (select auth.uid()) is not null then 'lobby'
  end
  from public.sessions s
  where s.ended_at is null and s.code = split_part(p_topic, ':', 2)
$$;

-- For turn-credentials: relay credentials only for someone in an active session.
create function public.together_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sessions s where s.ended_at is null and (s.host = (select auth.uid())
    or exists (select 1 from public.session_members m where m.session_id = s.id and m.user_id = (select auth.uid()))))
$$;

-- ---------- Realtime Authorization (private channels)
create policy "together: members read; signed-in read the lobby" on realtime.messages for select to authenticated
  using (case realtime.messages.extension
    when 'presence' then public.together_access((select realtime.topic())) in ('host', 'listener')
    when 'broadcast' then public.together_access((select realtime.topic())) is not null
  end);
create policy "together: members share presence" on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'presence' and public.together_access((select realtime.topic())) in ('host', 'listener'));

-- ---------- sending
create table public.together_rate (
  session_id uuid not null references public.sessions on delete cascade,
  user_id uuid not null,
  bucket text not null,
  window_start timestamptz not null default now(),
  n int not null default 0,
  primary key (session_id, user_id, bucket)
);
alter table public.together_rate enable row level security;   -- no policies: only together_send touches it
revoke all on public.together_rate from anon, authenticated;

create function public.together_send(p_code text, p_event text, p_payload jsonb) returns void
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
  select * into s from public.sessions where code = p_code and ended_at is null;
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

-- Functions: signed-in users only (Supabase grants new functions to anon by default).
revoke execute on function public.session_lookup(text), public.together_access(text), public.together_active(), public.together_send(text, text, jsonb), public.session_members_cap() from public, anon;
grant execute on function public.session_lookup(text), public.together_access(text), public.together_active(), public.together_send(text, text, jsonb) to authenticated;
revoke execute on function public.session_members_cap() from authenticated;
