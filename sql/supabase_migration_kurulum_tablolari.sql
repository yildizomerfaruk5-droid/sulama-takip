-- ============================================================
-- KURULUM SIHIRBAZI — ASAMA 1: YENI TABLOLAR + RLS (29 Temmuz 2026)
-- Kaynak spesifikasyon: KURULUM_SIHIRBAZI_SPEC.md  Bolum 3 ve 6.1
--
-- AMAC: Saha cizimlerini (parsel / ana boru / kuyu-ayrim noktalari) ve
--       fiskiye dizilim kurallarini koddan veritabanina tasimak.
--
-- BU DOSYA HICBIR MEVCUT TABLOYU SILMEZ, HICBIR KOLONU DEGISTIRMEZ.
-- Yalnizca yeni tablolar ve yeni (nullable / varsayilanli) kolonlar ekler.
-- Uygulama bu asamada hala harita.js icindeki sabit veriyi kullanir;
-- veri gecici olarak iki yerde durur — normaldir.
--
-- IDEMPOTENT: birden fazla kez calistirilabilir.
-- Supabase Dashboard > SQL Editor'da calistirin.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PARSELLER — tapulu tarla poligonlari
--    koordinatlar: [[lng,lat], ...]  (GeoJSON sirasi — harita.js
--    cizimde [c[1], c[0]] ile ters cevirir; konvansiyon korunur)
-- ------------------------------------------------------------
create table if not exists parseller (
  id uuid primary key default gen_random_uuid(),
  bolge_id uuid not null references bolgeler(id) on delete cascade,
  zona_id uuid references zonalar(id),           -- opsiyonel gruplama
  ad text not null,                              -- orn: '119/7'
  alan_m2 numeric,
  koordinatlar jsonb not null,                   -- [[lng,lat], ...]
  renk text default '#3fae4a',
  sira_no int default 1,
  olusturma_zamani timestamptz default now()
);

-- Ayni bolgede ayni parsel adi bir kez (seed'in tekrar calisabilmesi icin sart)
create unique index if not exists parseller_bolge_ad_uniq
  on parseller (bolge_id, ad);
create index if not exists parseller_bolge_idx on parseller (bolge_id);

-- ------------------------------------------------------------
-- 2. BORU HATLARI — ana ve yan boru guzergahlari
--    koordinatlar: [[lat,lng], ...]  (Leaflet polyline sirasi —
--    parsellerden FARKLI; mevcut koddaki gibi)
-- ------------------------------------------------------------
create table if not exists boru_hatlari (
  id uuid primary key default gen_random_uuid(),
  bolge_id uuid not null references bolgeler(id) on delete cascade,
  ad text not null,                              -- orn: 'Vana 3 - 114 grubu'
  tip text default 'ana' check (tip in ('ana','yan')),
  koordinatlar jsonb not null,                   -- [[lat,lng], ...]
  renk text default '#2196f3',
  kesikli boolean default false,
  sira_no int default 1,
  olusturma_zamani timestamptz default now()
);

create unique index if not exists boru_hatlari_bolge_ad_uniq
  on boru_hatlari (bolge_id, ad);
create index if not exists boru_hatlari_bolge_idx on boru_hatlari (bolge_id);

-- ------------------------------------------------------------
-- 3. SAHA NOKTALARI — kuyu, ayrim noktalari, karavan, depo
-- ------------------------------------------------------------
create table if not exists saha_noktalari (
  id uuid primary key default gen_random_uuid(),
  bolge_id uuid not null references bolgeler(id) on delete cascade,
  tip text not null check (tip in ('kuyu','ayrim','karavan','depo','diger')),
  ad text,
  lat double precision not null,
  lng double precision not null,
  ikon text,                                     -- opsiyonel emoji/simge
  notlar text,
  olusturma_zamani timestamptz default now()
);

create unique index if not exists saha_noktalari_bolge_tip_ad_uniq
  on saha_noktalari (bolge_id, tip, coalesce(ad, '-'));
create index if not exists saha_noktalari_bolge_idx on saha_noktalari (bolge_id);

-- ------------------------------------------------------------
-- 4. VANALAR — yeni kolonlar
--    parsel (text) kolonu geriye donuk uyumluluk icin KALIR.
--    cizim_kurali: fiskiye dizilim ozel kurali (bkz. spec 3.5)
-- ------------------------------------------------------------
alter table vanalar add column if not exists parsel_id uuid references parseller(id);
alter table vanalar add column if not exists cizim_kurali jsonb;

create index if not exists vanalar_parsel_id_idx on vanalar (parsel_id);

-- Kirpma alani birden fazla parsele yayilabilir ('119/7-119/6')
create table if not exists vana_parselleri (
  vana_id uuid not null references vanalar(id) on delete cascade,
  parsel_id uuid not null references parseller(id) on delete cascade,
  primary key (vana_id, parsel_id)
);

create index if not exists vana_parselleri_parsel_idx on vana_parselleri (parsel_id);

-- ------------------------------------------------------------
-- 5. BOLGELER — saha ayarlari
--    Varsayilanlar mevcut Kayseri degerleridir (harita.js:
--    FISKIYE_ARALIK = 10, FISKIYE_KAPSAMA = 7; hatlar 480 dk).
--    kurulum_tamam: sihirbaz bitirildiginde true olur — Kayseri icin
--    harita.js refactoru dogrulandiktan SONRA (spec 6.7) acilacak.
-- ------------------------------------------------------------
alter table bolgeler add column if not exists fiskiye_araligi_m numeric default 10;
alter table bolgeler add column if not exists fiskiye_kapsama_m numeric default 7;
alter table bolgeler add column if not exists fiskiye_alan_m2 numeric default 120;
alter table bolgeler add column if not exists varsayilan_sure_dk int default 480;
alter table bolgeler add column if not exists kurulum_tamam boolean default false;

-- ------------------------------------------------------------
-- 6. RLS — mevcut desen (supabase_migration_rls_guvenlik.sql)
--    OKUMA : herkese acik (viewer sifresiz calisir)
--    YAZMA : yalnizca girisli yonetici / denetleyici
--    isci ve anon: yazamaz
-- ------------------------------------------------------------
do $$
declare t text;
begin
  if to_regprocedure('public.aktif_rol()') is null then
    raise exception 'public.aktif_rol() bulunamadi — once supabase_migration_rls_guvenlik.sql calistirin';
  end if;

  foreach t in array array['parseller','boru_hatlari','saha_noktalari','vana_parselleri']
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

-- ------------------------------------------------------------
-- 7. KONTROL — 4 tabloda da rls_acik = true ve politika_sayisi = 2
-- ------------------------------------------------------------
select t.tablename,
       t.rowsecurity as rls_acik,
       count(p.policyname) as politika_sayisi
from pg_tables t
left join pg_policies p
       on p.tablename = t.tablename and p.schemaname = 'public'
where t.schemaname = 'public'
  and t.tablename in ('parseller','boru_hatlari','saha_noktalari','vana_parselleri')
group by 1, 2
order by 1;

-- Yeni kolonlar yerinde mi?
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (   (table_name = 'vanalar'  and column_name in ('parsel_id','cizim_kurali'))
       or (table_name = 'bolgeler' and column_name in ('fiskiye_araligi_m','fiskiye_kapsama_m',
                                                       'fiskiye_alan_m2','varsayilan_sure_dk',
                                                       'kurulum_tamam')))
order by table_name, column_name;
-- Beklenen: 2 + 5 = 7 satir
