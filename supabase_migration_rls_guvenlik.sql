-- ============================================================
-- GUVENLIK SERTLESTIRMESI — TUM TABLOLARDA RLS (16 Temmuz 2026)
-- Supabase Dashboard > SQL Editor'da calistirin.
--
-- ILKE:
--   OKUMA : herkese acik (viewer sifresiz calisir)
--           istisna: giris_gecmisi, olay_loglari, profiller
--   YAZMA : yalnizca girisli + yetkili kullanicilar
--           yonetici / denetleyici : her sey
--           isci                   : yalnizca kayit + gubre girisi
--           anon (giris yok)       : HICBIR SEY YAZAMAZ
-- ============================================================

-- ------------------------------------------------------------
-- 0. ROL YARDIMCI FONKSIYONU
--    (security definer: profiller RLS'ine takilmadan rol okur)
-- ------------------------------------------------------------
create or replace function public.aktif_rol()
returns text
language sql security definer stable
set search_path = public
as $$
  select rol from profiller where id = auth.uid()
$$;

-- ------------------------------------------------------------
-- 1. MEVCUT TUM AUTH KULLANICILARINA YONETICI PROFILI
--    (kilitli kalmamak icin — su anki admin hesabin dahil)
-- ------------------------------------------------------------
insert into profiller (id, email, rol)
select id, email, 'yonetici' from auth.users
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 2. CEKIRDEK TABLOLAR: OKUMA HERKESE, YAZMA YONETICI/DENETLEYICI
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['bolgeler','zonalar','hatlar','vanalar','turlar',
                           'sulama_kayitlari','gubreler','gubre_uygulamalari',
                           'sistem_durumu']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "%s_oku" on %I', t, t);
    execute format('create policy "%s_oku" on %I for select using (true)', t, t);
    execute format('drop policy if exists "%s_yonet" on %I', t, t);
    execute format(
      'create policy "%s_yonet" on %I for all to authenticated
         using (public.aktif_rol() in (''yonetici'',''denetleyici''))
         with check (public.aktif_rol() in (''yonetici'',''denetleyici''))', t, t);
  end loop;
end $$;

-- Eski (fazla genis) politikalari kaldir
drop policy if exists "bolgeler_herkes_okur" on bolgeler;
drop policy if exists "vanalar_herkes_okur" on vanalar;
drop policy if exists "gubreler_herkes_okur" on gubreler;
drop policy if exists "gubre_uyg_herkes_okur" on gubre_uygulamalari;
drop policy if exists "gubre_uyg_ekle" on gubre_uygulamalari;  -- anon yazabiliyordu!

-- ------------------------------------------------------------
-- 3. ISCI ROLU: yalnizca saha verisi girebilir
-- ------------------------------------------------------------
drop policy if exists "kayit_isci_ekle" on sulama_kayitlari;
create policy "kayit_isci_ekle" on sulama_kayitlari
  for insert to authenticated
  with check (public.aktif_rol() = 'isci');

drop policy if exists "gubre_isci_ekle" on gubre_uygulamalari;
create policy "gubre_isci_ekle" on gubre_uygulamalari
  for insert to authenticated
  with check (public.aktif_rol() = 'isci');

-- ------------------------------------------------------------
-- 4. OZEL TABLOLAR (anon goremez)
-- ------------------------------------------------------------
alter table giris_gecmisi enable row level security;
drop policy if exists "giris_oku" on giris_gecmisi;
create policy "giris_oku" on giris_gecmisi
  for select to authenticated using (true);
drop policy if exists "giris_yaz" on giris_gecmisi;
create policy "giris_yaz" on giris_gecmisi
  for insert to authenticated with check (true);

-- olay_loglari politikalari onceki migrationda kuruldu (authenticated)
-- profiller politikasi onceki migrationda kuruldu (kendi profilini okur)

-- ------------------------------------------------------------
-- 5. STORAGE: fotograf yukleme yalnizca girisli kullanicilara
--    (okuma public kalir — galeri viewer'da da calisir)
-- ------------------------------------------------------------
drop policy if exists "auth_upload_foto" on storage.objects;
create policy "auth_upload_foto" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotograflar');

-- ------------------------------------------------------------
-- 6. KONTROL
-- ------------------------------------------------------------
select t.tablename,
       t.rowsecurity as rls_acik,
       count(p.policyname) as politika_sayisi
from pg_tables t
left join pg_policies p on p.tablename = t.tablename and p.schemaname = 'public'
where t.schemaname = 'public'
group by 1, 2
order by 1;

-- Beklenen: tum tablolarda rls_acik = true, politika_sayisi >= 2
-- (counter gibi kullanilmayan tablo yoksa)

-- ============================================================
-- SONRAKI ADIM (elle, panel uzerinden): ANAHTAR ROTASYONU
-- 1) Supabase Dashboard > Settings > API > "JWT Secret" > Generate new
--    (dikkat: mevcut anon anahtar aninda gecersiz olur)
-- 2) Yeni anon anahtari kopyala
-- 3) Bilgisayarda .env dosyasindaki VITE_SUPABASE_ANON_KEY degerini guncelle
-- 4) Vercel > Settings > Environment Variables > ayni degeri guncelle
-- 5) Vercel > Deployments > Redeploy
-- Boylece git tarihcesinde gorunen eski anahtar tamamen olur.
-- ============================================================
