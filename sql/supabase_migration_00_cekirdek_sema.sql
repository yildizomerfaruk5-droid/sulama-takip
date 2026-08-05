-- ============================================================
-- CEKIRDEK SEMA — zonalar, hatlar, turlar, sulama_kayitlari,
--                 sistem_durumu
--
-- NEDEN VAR:
--   Bu bes tablo projenin en basinda Supabase panelinden ELLE
--   olusturulmustu ve hicbir migration dosyasinda tanimlari yoktu.
--   Bulut ortaminda sorun cikarmadi (tablolar zaten oradaydi), ama
--   SIFIRDAN bir veritabani (yerel kurulum, yeni isletme) kurulurken
--   sql/README.md'deki sira ilk dosyada patliyordu:
--       supabase_migration_bolgeler.sql
--       -> ERROR: relation "zonalar" does not exist
--
--   Bu dosya o bosluğu doldurur ve sıranın EN BASINA gelir.
--
-- NASIL TURETILDI:
--   Uretimdeki (Kayseri) tablolarin gercek kolonlari PostgREST
--   uzerinden okunarak birebir yeniden yazildi.
--
-- SONRADAN EKLENEN KOLONLAR BU DOSYADA YOKTUR — kendi
-- migration'lari eklemeye devam etsin diye bilerek disarida
-- birakildilar (hepsi `add column if not exists`):
--   zonalar.bolge_id            -> supabase_migration_bolgeler.sql
--   sistem_durumu.bolge_id      -> supabase_migration_bolgeler.sql
--   sulama_kayitlari.istemci_id -> sql/supabase_migration_offline_kuyruk.sql
--
-- MEVCUT KURULUMLARI ETKILEMEZ: hepsi `create table if not exists`.
-- Bulut veritabaninda calistirilirsa hicbir sey degismez.
--
-- Bu betik IDEMPOTENT'tir.
-- ============================================================

-- Sulama bolgelerinin mantiksal gruplari (Zona 1, Zona 2, ...)
create table if not exists zonalar (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  aciklama text,
  sira_no int,
  olusturma_tarihi timestamptz default now()
);

-- Sulama hatlari. Bir tur boyunca sira_no duzeninde sulanirlar.
create table if not exists hatlar (
  id uuid primary key default gen_random_uuid(),
  zona_id uuid references zonalar(id),
  hat_no int,
  parsel_bilgisi text,
  fiskiye_sayisi int,
  varsayilan_sure_dk int,          -- hat_gecis_kontrol() bunu okur
  baslangic_lat double precision,
  baslangic_lng double precision,
  bitis_lat double precision,
  bitis_lng double precision,
  sira_no int,                     -- hat_gecis_kontrol() siradakini bununla bulur
  aktif boolean default true,
  olusturma_tarihi timestamptz default now()
);

-- Sulama turlari ("1. Su", "2. Su", ...). Zona bazli, dongusel.
create table if not exists turlar (
  id uuid primary key default gen_random_uuid(),
  zona_id uuid references zonalar(id),
  tur_no int,
  baslangic_zamani timestamptz,
  bitis_zamani timestamptz,
  sulanan_hat_sayisi int default 0,
  atlanan_hat_sayisi int default 0,
  durum text default 'devam',      -- 'devam' | 'tamamlandi'
  olusturma_zamani timestamptz default now()
);

-- Saha kayitlari.
--   sure_dakika DOLU  -> gercek hat tamamlanmasi (sunucu akisinin parcasi)
--   sure_dakika BOS   -> veri girisi (not, foto, gubre uygulamasi)
-- Bu ayrim uygulamanin her yerinde yuk tasir; degistirmeyin.
create table if not exists sulama_kayitlari (
  id uuid primary key default gen_random_uuid(),
  hat_id uuid references hatlar(id),
  tur_id uuid references turlar(id),
  baslangic_zamani timestamptz,
  bitis_zamani timestamptz,
  sure_dakika int,
  islem_turu text default 'sulama',
  ilac_gubre_notu text,
  fotograf_url text,
  durum text default 'devam',      -- 'devam' | 'tamamlandi'
  olusturma_zamani timestamptz default now()
);

-- Tek satirlik canli durum (bolge basina bir satir).
-- id int'tir (uuid degil) — uretimdeki hali boyle.
create table if not exists sistem_durumu (
  id serial primary key,
  aktif_hat_id uuid references hatlar(id),
  siradaki_hat_id uuid references hatlar(id),
  aktif_tur_id uuid references turlar(id),
  aktif_zona_id uuid references zonalar(id),
  sistem_acik boolean default false,
  guncelleme_zamani timestamptz default now(),
  -- Aktif hattin baslama ani. hat_gecis_kontrol() sureyi bununla
  -- olcer; olmazsa otomatik hat gecisi HIC calismaz.
  -- Uretimde bu kolon supabase_hatlar_1_4.sql (bir VERI dosyasi)
  -- icinde eklenmisti; temiz kurulumda o dosya calismadigi icin
  -- dogru yeri burasidir.
  hat_baslama_zamani timestamptz
);

-- Yonetici giris gecmisi (src/auth.js yazar ve okur).
-- RLS politikalari supabase_migration_rls_guvenlik.sql'de kurulur;
-- o dosya bu tablo olmadan patliyordu.
create table if not exists giris_gecmisi (
  id uuid primary key default gen_random_uuid(),
  kullanici_email text,
  giris_zamani timestamptz default now(),
  cihaz text
);

-- ============================================================
-- KONTROL SORGUSU — alti tablo da yerinde mi? (6 satir beklenir)
-- ============================================================
select table_name,
       (select count(*) from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = t.table_name) as kolon_sayisi
from information_schema.tables t
where table_schema = 'public'
  and table_name in ('zonalar','hatlar','turlar','sulama_kayitlari',
                     'sistem_durumu','giris_gecmisi')
order by table_name;

select 'cekirdek sema hazir' as durum;
