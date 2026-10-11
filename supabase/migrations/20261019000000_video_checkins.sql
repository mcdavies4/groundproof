-- Video check-ins: a 15-second walk-round clip recorded in the app, alongside the photos.
alter table public.checkins
  add column video_path text check (video_path is null or video_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/walk\.mp4$');

-- Owners can ask for a video with every check-in. Without one, a check-in can't be "Verified".
alter table public.properties add column require_video boolean not null default false;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checkin-videos', 'checkin-videos', false, 31457280, array['video/mp4'])
on conflict (id) do nothing;

-- Same path convention as photos: <property_id>/<checkin_id>/walk.mp4
create policy "reporters upload videos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'checkin-videos'
    and public.is_reporter(((storage.foldername(name))[1])::uuid)
  );
create policy "members view videos" on storage.objects
  for select to authenticated using (
    bucket_id = 'checkin-videos'
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );
