-- ============================================================
-- BOLGELER + ROL SISTEMI — YALNIZCA SEMA
--
-- KAYNAK: supabase_migration_bolgeler.sql (depo kokunde)
-- FARK  : "kayseri-ana" bolgesini olusturan ve mevcut zonalar/
--         sistem_durumu satirlarini o bolgeye baglayan blok YOK.
--
-- NEDEN : Yerel kurulumda her isletme kendi bolgesini KURULUM
--         SIHIRBAZINDAN olusturur. Baska bir ciftligin bolge kaydiyla
--         baslamamalidir.
--
-- ⚠️ BAKIM: Bu tablolara yeni bir KOLON eklenirse iki dosyayi da
--    guncelleyin — bulut orijinali ve bu sema esi.
--    Bkz. docs/YEREL_KURULUM.md > "Sema/veri ayrimi" tablosu.
--
-- Bu betik IDEMPOTENT'tir.
-- ============================================================

-- 1. BOLGELER TABLOSU
create table if not exists bolgeler (
  id uuid primary key default gen_random_uuid(),
  kod text unique not null,              -- url ve kod ici tanimlayici, orn: 'kayseri-ana'
  ad text not null,                      -- orn: 'Kayseri - Ana Saha'
  il text,
  ilce text,
  aciklama text,
  merkez_lat double precision,           -- harita merkezi
  merkez_lng double precision,
  varsayilan_zoom int default 15,
  sira_no int default 1,
  aktif boolean default true,
  olusturma_zamani timestamptz default now()
);

-- 2. ZONALAR -> BOLGE BAGLANTISI
alter table zonalar add column if not exists bolge_id uuid references bolgeler(id);

-- 3. SISTEM_DURUMU -> BOLGE BAZLI (id=1 tek satir varsayimi kalkiyor)
alter table sistem_durumu add column if not exists bolge_id uuid references bolgeler(id);

-- 4. PROFILLER (rol sistemi: yonetici > denetleyici > isci)
create table if not exists profiller (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  ad_soyad text,
  rol text not null default 'isci' check (rol in ('yonetici','denetleyici','isci')),
  bolge_id uuid references bolgeler(id), -- yonetici icin NULL (tum bolgeler)
  olusturma_zamani timestamptz default now()
);

-- Kullanici sadece kendi profilini okuyabilsin
alter table profiller enable row level security;
drop policy if exists "kendi_profilini_oku" on profiller;
create policy "kendi_profilini_oku" on profiller
  for select using (auth.uid() = id);

-- 5. (ORIJINALDEKI KAYSERI BOLGESI OLUSTURMA BLOGU BILEREK YOK)
--    Yeni isletme bolgesini kurulum sihirbazindan olusturur.

-- Her bolgenin tek sistem_durumu satiri olsun
create unique index if not exists sistem_durumu_bolge_uniq on sistem_durumu(bolge_id);

-- 6. YENI BOLGE EKLENINCE SISTEM_DURUMU SATIRI OTOMATIK OLUSSUN
--    (Sihirbaz bolgeyi yazinca durum satiri kendiliginden gelir.)
create or replace function bolge_sistem_durumu_olustur() returns trigger as $$
begin
  insert into sistem_durumu (bolge_id, sistem_acik) values (new.id, false);
  return new;
end $$ language plpgsql;

drop trigger if exists trg_bolge_sistem_durumu on bolgeler;
create trigger trg_bolge_sistem_durumu
  after insert on bolgeler
  for each row execute function bolge_sistem_durumu_olustur();

select 'bolgeler semasi hazir (veri yok)' as durum;
