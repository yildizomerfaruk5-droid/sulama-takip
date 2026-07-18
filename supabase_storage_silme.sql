-- Fotograf silme yetkisi: yalnizca girisli kullanicilar (kayit silme butonu icin)
-- Supabase Dashboard > SQL Editor'da calistirin.
drop policy if exists "auth_delete_foto" on storage.objects;
create policy "auth_delete_foto" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotograflar');
select 'storage silme politikasi hazir' as durum;
