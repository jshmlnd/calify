-- One active Listen together session per host, so nobody can hold every CALI-0000..9999 code at once.
create unique index sessions_one_active_per_host on public.sessions (host) where ended_at is null;
