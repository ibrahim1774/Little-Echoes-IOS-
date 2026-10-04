-- Let users delete their own audio files and replace their own videos.
-- The web app's deletes of audio files were silently rejected without this.
create policy "Users can delete own recordings"
  on storage.objects for delete
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can update their own videos"
  on storage.objects for update to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete own sessions"
  on public.sessions for delete
  using (auth.uid() = user_id);
