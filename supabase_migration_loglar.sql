-- ============================================================
-- OLAY LOG SISTEMI (16 Temmuz 2026)
-- Supabase Dashboard > SQL Editor'da calistirin.
-- ============================================================

create table if not exists olay_loglari (
  id uuid primary key default gen_random_uuid(),
  bolge_id uuid references bolgeler(id),
  kullanici_email text,
  olay text not null,        -- sistem_baslatildi, sistem_kapatildi, hat_gecisi,
                             -- sure_degistirildi, kayit_eklendi, yedek_alindi ...
  detay text,
  olusturma_zamani timestamptz default now()
);

create index if not exists olay_loglari_zaman_idx
  on olay_loglari (olusturma_zamani desc);

-- Loglari yalnizca giris yapmis kullanicilar gorur/yazar (viewer goremez)
alter table olay_loglari enable row level security;

drop policy if exists "log_oku" on olay_loglari;
create policy "log_oku" on olay_loglari
  for select to authenticated using (true);

drop policy if exists "log_yaz" on olay_loglari;
create policy "log_yaz" on olay_loglari
  for insert to authenticated with check (true);

-- ============================================================
-- YEDEKLEME NOTU
-- ============================================================
-- Uygulamadaki "Yedek Indir" butonu tum tablolari tek JSON dosyasi
-- olarak indirir (fotograf dosyalari haric — onlarin URL listesi girer).
-- Geri yukleme gerektiginde JSON'daki tablolar SQL editorden ya da
-- gelistirici yardimiyla geri yazilir.
--
-- Ek oneri: Supabase Dashboard > Database > Backups bolumunde gunluk
-- otomatik yedekler (ucretli planlarda) mevcuttur.

select 'olay_loglari hazir' as durum;
