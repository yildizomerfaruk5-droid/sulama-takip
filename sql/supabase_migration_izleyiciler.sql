-- ============================================================
-- IZLEYICILER — misafir izleme ekranini kimin actigini ayirt etme
-- Supabase Dashboard > SQL Editor'da calistirin.
--
-- AMAC: ~5 kisi ?viewer ekranini misafir modunda aciyor ve hepsi
--       anonim kaydediliyordu (ziyaretci_loglari.cihaz yalnizca ham
--       user-agent). Artik gecmis kayitlarda "Ahmet — 14:20'de bakti"
--       goruntulenebilir.
--
-- KAPSAM: yalnizca GECMIS log. Canli "su an kim bakiyor" paneli YOK.
--
-- ILKE (mevcut desen — supabase_migration_rls_guvenlik.sql):
--   OKUMA : herkese acik (viewer girissiz calisir, isim listesini
--           anon olarak okuyabilmeli)
--   YAZMA : yalnizca yonetici / denetleyici
--
-- Bu betik IDEMPOTENT'tir: birden fazla kez calistirilabilir.
-- Hicbir mevcut tablo silinmez, mevcut kolon degistirilmez.
-- ============================================================

-- Rol fonksiyonu olmadan politikalar sessizce yanlis kurulur.
do $$
begin
  if to_regprocedure('public.aktif_rol()') is null then
    raise exception
      'public.aktif_rol() bulunamadi. Once supabase_migration_rls_guvenlik.sql calistirilmali.';
  end if;
end $$;

-- ------------------------------------------------------------
-- 1. IZLEYICILER TABLOSU
--    Silme YOK, yalnizca pasiflestirme: gecmis loglardaki isim
--    referansi kopmasin.
-- ------------------------------------------------------------
create table if not exists izleyiciler (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  aktif boolean not null default true,
  sira_no int,
  olusturma_zamani timestamptz default now()
);

-- Ayni isim iki kez tanimlanamasin (buyuk/kucuk harf duyarsiz).
-- Pasif kayitlar da kapsanir: pasif olan yeniden aktif edilir, kopyalanmaz.
create unique index if not exists izleyiciler_ad_tekil
  on izleyiciler (lower(ad));

-- ------------------------------------------------------------
-- 2. ZIYARETCI_LOGLARI'NA IZLEYICI BAGI
--    Eski kayitlar null kalir (sorun degil — cihaz ozetine dusulur).
--    on delete set null: izleyici satiri bir gun silinse bile log kalir.
-- ------------------------------------------------------------
alter table ziyaretci_loglari
  add column if not exists izleyici_id uuid references izleyiciler(id) on delete set null;

create index if not exists ziyaretci_loglari_izleyici_idx
  on ziyaretci_loglari (izleyici_id);

-- ------------------------------------------------------------
-- 3. RLS
-- ------------------------------------------------------------
alter table izleyiciler enable row level security;

-- Okuma herkese acik: viewer login'siz calisir, "Sen kimsin?"
-- seciciyi doldurabilmek icin anon olarak listeyi okumali.
drop policy if exists "izleyiciler_oku" on izleyiciler;
create policy "izleyiciler_oku" on izleyiciler
  for select using (true);

-- Yazma yalnizca yonetici/denetleyici (gubreler'deki desenin aynisi).
-- isci ve anon icin insert/update/delete politikasi YOKTUR.
drop policy if exists "izleyiciler_yonet" on izleyiciler;
create policy "izleyiciler_yonet" on izleyiciler
  for all to authenticated
  using (public.aktif_rol() in ('yonetici','denetleyici'))
  with check (public.aktif_rol() in ('yonetici','denetleyici'));

-- ============================================================
-- KONTROL SORGULARI
-- ============================================================

-- Tablo ve kolon yerinde mi?
select
  (select count(*) from izleyiciler)                        as izleyici_sayisi,
  (select count(*) from izleyiciler where aktif)            as aktif_izleyici,
  (select count(*) from ziyaretci_loglari)                  as toplam_ziyaret,
  (select count(*) from ziyaretci_loglari
     where izleyici_id is not null)                         as isimli_ziyaret,
  (select count(*) from ziyaretci_loglari
     where izleyici_id is null)                             as anonim_ziyaret_eski;

-- Politikalar dogru kuruldu mu? (2 satir beklenir)
select policyname, cmd, roles::text
from pg_policies
where schemaname = 'public' and tablename = 'izleyiciler'
order by policyname;

-- Kolon gercekten eklendi mi? (1 satir beklenir, is_nullable = YES)
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'ziyaretci_loglari'
  and column_name = 'izleyici_id';

select 'izleyiciler hazir' as durum;
