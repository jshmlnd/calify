-- Calify 1.1: profiles, follows, public playlists, bug reports, Listen together sessions, image buckets.
-- Every table has RLS on. Signed-out (anon) clients may only insert bug reports.

-- ---------- profiles (id = auth user id)
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text check (char_length(name) between 1 and 40),
  bio text check (char_length(bio) <= 160),
  avatar_path text,
  background_path text,
  accent text check (accent ~ '^#[0-9a-fA-F]{6}$'),
  theme text check (theme in ('calico', 'midnight', 'daylight')),
  last_played jsonb check (jsonb_typeof(last_played) = 'object' and pg_column_size(last_played) <= 2000),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles: signed-in read" on public.profiles for select to authenticated using (true);
create policy "profiles: insert own" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- New user -> profile row, name from Google's full_name (cut to the 40-char limit).
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name) values (new.id, left(coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(new.email, '@', 1), ''),
    'Calify listener'), 40));
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- follows
create table public.follows (
  follower uuid not null default auth.uid() references public.profiles on delete cascade,
  followee uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
create index follows_followee on public.follows (followee);
alter table public.follows enable row level security;
create policy "follows: signed-in read" on public.follows for select to authenticated using (true);
create policy "follows: follow as self" on public.follows for insert to authenticated with check (follower = (select auth.uid()));
create policy "follows: unfollow as self" on public.follows for delete to authenticated using (follower = (select auth.uid()));

-- ---------- public playlists (metadata only; music files are never uploaded)
create table public.public_playlists (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references public.profiles on delete cascade,
  local_id text not null,
  name text not null check (char_length(name) between 1 and 200),
  cover_path text,
  tracks jsonb not null default '[]' check (jsonb_typeof(tracks) = 'array'),
  updated_at timestamptz not null default now(),
  unique (owner, local_id)
);
alter table public.public_playlists enable row level security;
create policy "public_playlists: signed-in read" on public.public_playlists for select to authenticated using (true);
create policy "public_playlists: insert own" on public.public_playlists for insert to authenticated with check (owner = (select auth.uid()));
create policy "public_playlists: update own" on public.public_playlists for update to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "public_playlists: delete own" on public.public_playlists for delete to authenticated using (owner = (select auth.uid()));

-- ---------- bug reports (write-only from the app; read in the dashboard)
create table public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete set null,
  what text not null check (char_length(what) between 10 and 2000),
  expected text check (char_length(expected) <= 2000),
  app_version text check (char_length(app_version) <= 20),
  platform text check (platform in ('windows', 'android', 'web')),
  created_at timestamptz not null default now()
);
alter table public.bug_reports enable row level security;
create policy "bug_reports: anyone sends" on public.bug_reports for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

-- ---------- Listen together sessions (code is unique while the session is active)
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^CALI-[0-9]{4}$'),
  host uuid not null default auth.uid() references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index sessions_active_code on public.sessions (code) where ended_at is null;
alter table public.sessions enable row level security;
create policy "sessions: signed-in read" on public.sessions for select to authenticated using (true);
create policy "sessions: host starts" on public.sessions for insert to authenticated with check (host = (select auth.uid()));
create policy "sessions: host ends" on public.sessions for update to authenticated
  using (host = (select auth.uid())) with check (host = (select auth.uid()));

-- ---------- table privileges: anon gets nothing but sending a bug report (RLS still applies)
revoke all on public.profiles, public.follows, public.public_playlists, public.bug_reports, public.sessions from anon;
grant insert on public.bug_reports to anon;

-- ---------- storage: private buckets, signed-in read, write only under <uid>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('backgrounds', 'backgrounds', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('covers', 'covers', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "calify images: signed-in read" on storage.objects for select to authenticated
  using (bucket_id in ('avatars', 'backgrounds', 'covers'));
create policy "calify images: owner uploads" on storage.objects for insert to authenticated
  with check (bucket_id in ('avatars', 'backgrounds', 'covers') and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "calify images: owner replaces" on storage.objects for update to authenticated
  using (bucket_id in ('avatars', 'backgrounds', 'covers') and (storage.foldername(name))[1] = (select auth.uid()::text))
  with check (bucket_id in ('avatars', 'backgrounds', 'covers') and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "calify images: owner deletes" on storage.objects for delete to authenticated
  using (bucket_id in ('avatars', 'backgrounds', 'covers') and (storage.foldername(name))[1] = (select auth.uid()::text));
