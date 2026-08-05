-- ============================================================
-- GUBRE MODULU — YALNIZCA SEMA
--
-- KAYNAK: supabase_migration_gubreler.sql (depo kokunde)
-- FARK  : Kayseri isletmesinin 6 gubre tanimi (Karboksilik Asit,
--         Hayvansal Aminoasit, UAN 32, Sivi Kukurt, 33 Nitrat,
--         Amonyum Tiyosulfat) YOK.
--
-- NEDEN : Bunlar bir isletmenin kendi urun listesidir, evrensel
--         bir tanim kumesi degil. Yeni isletme kendi gubrelerini
--         hat popup'indaki "➕ Yeni gubre ekle" ile sahada tanimlar
--         (yonetici/denetleyici yetkisi gerekir).
--
-- Liste bos oldugunda arayuz "Gubre tanimi bulunamadi" der ve
-- ekleme baglantisini gosterir — akis bozulmaz.
--
-- ⚠️ BAKIM: Bu tablolara yeni bir KOLON eklenirse iki dosyayi da
--    guncelleyin — bulut orijinali ve bu sema esi.
--    Bkz. docs/YEREL_KURULUM.md > "Sema/veri ayrimi" tablosu.
--
-- Bu betik IDEMPOTENT'tir.
-- ============================================================

-- 1. GUBRE TANIMLARI
create table if not exists gubreler (
  id uuid primary key default gen_random_uuid(),
  ad text unique not null,
  varsayilan_birim text not null default 'litre' check (varsayilan_birim in ('litre','kg')),
  sira_no int default 1,
  aktif boolean default true,
  olusturma_zamani timestamptz default now()
);

alter table gubreler enable row level security;
drop policy if exists "gubreler_herkes_okur" on gubreler;
create policy "gubreler_herkes_okur" on gubreler for select using (true);

-- (ORIJINALDEKI 6 GUBRE TANIMININ INSERT BLOGU BILEREK YOK)

-- 2. GUBRE UYGULAMALARI (her sulama kaydina bagli, birden fazla olabilir)
create table if not exists gubre_uygulamalari (
  id uuid primary key default gen_random_uuid(),
  kayit_id uuid references sulama_kayitlari(id) on delete cascade,
  gubre_id uuid references gubreler(id),
  miktar numeric not null check (miktar > 0),
  birim text not null check (birim in ('litre','kg')),
  olcek text not null check (olcek in ('dekar','hat')),  -- 5 litre/DEKAR veya 5 litre/HAT
  olusturma_zamani timestamptz default now()
);

alter table gubre_uygulamalari enable row level security;
drop policy if exists "gubre_uyg_herkes_okur" on gubre_uygulamalari;
create policy "gubre_uyg_herkes_okur" on gubre_uygulamalari for select using (true);
drop policy if exists "gubre_uyg_ekle" on gubre_uygulamalari;
create policy "gubre_uyg_ekle" on gubre_uygulamalari for insert with check (true);
-- Not: bu iki genis politika supabase_migration_rls_guvenlik.sql'de
-- daraltilir (anon yazamaz). Sira: once bu dosya, sonra RLS dosyasi.

select 'gubre semasi hazir (tanim yok — sahada eklenir)' as durum;
