-- ============================================================
-- VANALAR TABLOSU — YALNIZCA SEMA
--
-- KAYNAK: supabase_migration_vanalar.sql (depo kokunde)
-- FARK  : Kayseri KML'inden gelen 35 isaretcinin insert blogu YOK.
--
-- NEDEN : Yerel kurulumda vanalari isletme kendisi girer —
--         kurulum sihirbazi Adim 5'te KML/GeoJSON yukleyerek veya
--         haritadan tek tek isaretleyerek.
--
-- TEKILLIK NOTU: Orijinal dosya `(isaretci_no, coalesce(yon,'-'))`
--   uzerinde tekil indeks kurar; bu, tum sistemde isaretci
--   numaralarinin benzersiz olmasini zorlar ve ikinci bir bolge
--   "Isaretci 1"i ekleyemez. Yerel kurulum zaten dogrudan bolge
--   bazli dogru indeksi kurar (asagida) — bu yuzden burada eski
--   indeks HIC olusturulmaz.
--   Bkz. sql/supabase_duzeltme_vana_tekil_bolgeye_gore.sql
--
-- ⚠️ BAKIM: `vanalar` tablosuna yeni bir KOLON eklenirse iki dosyayi
--    da guncelleyin — bulut orijinali ve bu sema esi.
--    Bkz. docs/YEREL_KURULUM.md > "Sema/veri ayrimi" tablosu.
--
-- Bu betik IDEMPOTENT'tir.
-- ============================================================

create table if not exists vanalar (
  id uuid primary key default gen_random_uuid(),
  bolge_id uuid references bolgeler(id),
  hat_id uuid references hatlar(id),      -- hat gruplamasi sihirbazda yapilir
  isaretci_no int not null,               -- KML isaretci numarasi
  lat double precision not null,
  lng double precision not null,
  fiskiye_sayisi int not null default 0,
  yon text check (yon in ('alt','ust') or yon is null),  -- cift yonlu vanalar icin
  parsel text,
  ekim_yonu_derece int,                   -- sulama borusu dogrultusu (315=NW, 50=NE)
  boru_hatti text,
  notlar text,
  olusturma_zamani timestamptz default now()
);

-- Viewer sifresiz calistigi icin okuma herkese acik (bolgeler ile ayni mantik)
alter table vanalar enable row level security;
drop policy if exists "vanalar_herkes_okur" on vanalar;
create policy "vanalar_herkes_okur" on vanalar for select using (true);

-- Tekillik BOLGE BAZLI: her bolge kendi 1..N isaretci numaralarini kullanir
create unique index if not exists vanalar_bolge_isaretci_yon_uniq
  on vanalar (bolge_id, isaretci_no, coalesce(yon, '-'));

-- (ORIJINALDEKI 35 KAYSERI VANASININ INSERT BLOGU BILEREK YOK)

select 'vanalar semasi hazir (veri yok)' as durum;
