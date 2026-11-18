-- Cap a public playlist at 2000 tracks (NOT VALID: existing rows are not re-checked, new writes are).
alter table public.public_playlists
  add constraint public_playlists_tracks_max check (jsonb_array_length(tracks) <= 2000) not valid;
