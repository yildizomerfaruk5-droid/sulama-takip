-- ============================================================
-- COK BOLGELI YAPI + ROL SISTEMI MIGRATION
-- Supabase Dashboard > SQL Editor'da calistirin.
-- Yeni kod deploy edilmeden ONCE calistirilmalidir.
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

-- 5. MEVCUT VERIYI KAYSERI BOLGESINE BAGLA
do $$
declare b_id uuid;
begin
  select id into b_id from bolgeler where kod = 'kayseri-ana';
  if b_id is null then
    insert into bolgeler (kod, ad, il, merkez_lat, merkez_lng, varsayilan_zoom, sira_no)
    values ('kayseri-ana', 'Kayseri - Ana Saha', 'Kayseri', 38.6295, 36.2460, 15, 1)
    returning id into b_id;
  end if;

  update zonalar set bolge_id = b_id where bolge_id is null;
  update sistem_durumu set bolge_id = b_id where bolge_id is null;
end $$;

-- Her bolgenin tek sistem_durumu satiri olsun
create unique index if not exists sistem_durumu_bolge_uniq on sistem_durumu(bolge_id);

-- 6. YENI BOLGE EKLENINCE SISTEM_DURUMU SATIRI OTOMATIK OLUSSUN
create or replace function bolge_sistem_durumu_olustur() returns trigger as $$
begin
  insert into sistem_durumu (bolge_id, sistem_acik) values (new.id, false);
  return new;
end $$ language plpgsql;

drop trigger if exists trg_bolge_sistem_durumu on bolgeler;
create trigger trg_bolge_sistem_durumu
  after insert on bolgeler
  for each row execute function bolge_sistem_durumu_olustur();

-- ============================================================
-- KULLANIM NOTLARI
-- ============================================================
-- YENI BOLGE EKLEME ORNEGI (sistem_durumu otomatik olusur):
-- insert into bolgeler (kod, ad, il, ilce, merkez_lat, merkez_lng, sira_no)
-- values ('konya-cumra', 'Konya - Cumra', 'Konya', 'Cumra', 37.5726, 32.7745, 2);
--
-- KULLANICIYA ROL ATAMA:
-- 1) Dashboard > Authentication > Add User ile kullanici olustur
-- 2) Asagidaki gibi profil ekle (id = auth kullanicisinin UUID'si):
-- insert into profiller (id, email, ad_soyad, rol, bolge_id)
-- values ('AUTH-USER-UUID', 'denetci@ornek.com', 'Ad Soyad', 'denetleyici',
--         (select id from bolgeler where kod = 'kayseri-ana'));
--
-- ROLLER:
--   yonetici    : tum bolgeleri gorur, bolge secici ile gecis yapar (bolge_id NULL)
--   denetleyici : sadece kendi bolgesini gorur ve yonetir
--   isci        : simdilik salt-goruntuleme (isci arayuzu sonraki asamada)
--
-- NOT: Profili olmayan giris yapmis kullanici 'yonetici' sayilir
-- (gecis donemi icin - mevcut admin hesabin calismaya devam etsin diye).
-- Herkese profil ekledikten sonra bu davranisi koddan sikilastiracagiz.
