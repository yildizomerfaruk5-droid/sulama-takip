-- ============================================================
-- HAVA DURUMU — SAATLIK SICAKLIK KAYDI
--
-- AMAC: Her bolgenin konumuna gore saatlik hava sicakligi cekilir ve
--       KALICI olarak saklanir. Sulama kayitlariyla ayni zaman ekseninde
--       durur; ileride "hangi sicaklikta ne kadar su verdik" sorusu
--       cevaplanabilir.
--
-- NEREDE CALISIR: Supabase'in KENDI ICINDE.
--   pg_cron  -> saatte bir tetikler
--   pg_net   -> Open-Meteo'ya HTTP istegi atar
--   Tarayiciya, Vercel Cron'a veya harici bir secret'a IHTIYAC YOK.
--   (Tarayici tarafi olsaydi kimse uygulamayi acmadiginda -- ozellikle
--    geceleri -- veri toplanmazdi.)
--
-- SERVIS: Open-Meteo (https://open-meteo.com)
--   • API anahtari GEREKMEZ, ucretsiz kullanim
--   • Her cagri ~48 saatlik veri dondurur (past_days=1 + forecast_days=1)
--   • Bu YUZDEN KENDINI ONARIR: is 12 saat calismasa bile bir sonraki
--     basarili cagri eksik saatleri geri doldurur.
--
-- PG_NET ASENKRONDUR — bu yuzden IKI adim var:
--   1) hava_durumu_istek()  : istegi kuyruga atar, request_id'yi saklar
--   2) hava_durumu_topla()  : gelen yaniti okuyup tabloya yazar
--   Iki ayri cron isi, 3 dakika arayla calisir.
--
-- ⚠️ ILERIDE GELECEK OLCUM ISTASYONLARI ICIN NOT:
--   Kullanici toprak nemi/sicakligi, hava nemi ve basinc olcen kendi
--   istasyonlarini gelistiriyor. O veri BU TABLOYA KONMAMALIDIR:
--     • hava_durumu  = DIS KAYNAK tahmini, BOLGE basina (tek nokta)
--     • istasyon     = KENDI donanimi, ISTASYON basina (parselde konumlu)
--   Kardinalite ve anahtar farkli. Geldiginde ayri iki tablo acilmali:
--     olcum_istasyonlari (id, bolge_id, parsel_id, ad, enlem, boylam, aktif)
--     istasyon_olcumleri (istasyon_id, zaman, toprak_nem, toprak_sicaklik,
--                         hava_nem, hava_sicaklik, basinc)
--   Grafiklerde ikisini birlestirmek gerekirse VIEW yazilir.
--   Bu tabloya istasyon kolonu EKLEME.
--
-- Bu betik IDEMPOTENT'tir.
-- ============================================================

-- ------------------------------------------------------------
-- 0. GEREKLI UZANTILAR
-- ------------------------------------------------------------
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ------------------------------------------------------------
-- 1. VERI TABLOSU
-- ------------------------------------------------------------
create table if not exists hava_durumu (
  id uuid primary key default gen_random_uuid(),
  bolge_id uuid not null references bolgeler(id) on delete cascade,

  -- Saat basi an. UTC saklanir; gosterimde Europe/Istanbul'a cevrilir.
  zaman timestamptz not null,

  sicaklik_c numeric(5,2),

  -- Verinin alindigi nokta ve kaynagi (bolge merkezi tasinirsa gecmis bozulmasin)
  kaynak text not null default 'open-meteo',
  enlem double precision,
  boylam double precision,
  rakim_m numeric,

  olusturma_zamani timestamptz default now(),
  guncelleme_zamani timestamptz default now()
);

comment on table hava_durumu is
  'Bolge konumuna gore saatlik dis kaynak hava verisi (Open-Meteo). '
  'Kendi olcum istasyonu verisi BURAYA DEGIL, ayri tabloya yazilmalidir.';

-- Ayni bolge + saat + kaynak icin tek satir. Upsert bunun uzerinden calisir,
-- boylece ortusen cagrilar mukerrer kayit uretmez.
create unique index if not exists hava_durumu_tekil
  on hava_durumu (bolge_id, zaman, kaynak);

-- Zaman araligi sorgulari (grafik, "son 24 saat") icin
create index if not exists hava_durumu_zaman_idx
  on hava_durumu (bolge_id, zaman desc);

-- ------------------------------------------------------------
-- 2. ISTEK KUYRUGU
--    pg_net asenkron oldugu icin hangi request_id'nin hangi bolgeye
--    ait oldugunu burada tutuyoruz.
-- ------------------------------------------------------------
create table if not exists hava_durumu_istekleri (
  id bigint primary key,              -- net.http_get()'in dondurdugu request_id
  bolge_id uuid not null references bolgeler(id) on delete cascade,
  enlem double precision not null,
  boylam double precision not null,
  istek_zamani timestamptz not null default now(),
  islendi_mi boolean not null default false,
  hata text
);

create index if not exists hava_istek_bekleyen_idx
  on hava_durumu_istekleri (islendi_mi, istek_zamani)
  where islendi_mi = false;

-- ------------------------------------------------------------
-- 3. RLS
--    Okuma herkese acik (viewer sifresiz calisir, mevcut desen).
--    Yazma YALNIZCA fonksiyonlar araciligiyla (security definer);
--    istemciye dogrudan yazma yetkisi VERILMEZ.
-- ------------------------------------------------------------
alter table hava_durumu enable row level security;
drop policy if exists "hava_durumu_oku" on hava_durumu;
create policy "hava_durumu_oku" on hava_durumu
  for select using (true);

alter table hava_durumu_istekleri enable row level security;
-- Politika yok = hicbir istemci goremez/yazamaz (yalnizca security definer
-- fonksiyonlar ve servis rolu erisir). Ic kuyruk tablosu, kullaniciyi ilgilendirmez.

-- ------------------------------------------------------------
-- 4. ADIM 1 — ISTEGI GONDER
-- ------------------------------------------------------------
create or replace function public.hava_durumu_istek()
returns int
language plpgsql
security definer
set search_path = public, net
as $$
declare
  b record;
  url text;
  istek_id bigint;
  sayac int := 0;
begin
  for b in
    select id, merkez_lat, merkez_lng
    from bolgeler
    where aktif is not false
      and merkez_lat is not null
      and merkez_lng is not null
  loop
    -- past_days=1 + forecast_days=1 -> ~48 saatlik pencere.
    -- Kacan saatler bir sonraki basarili cagride geri dolar.
    url := format(
      'https://api.open-meteo.com/v1/forecast'
      || '?latitude=%s&longitude=%s'
      || '&hourly=temperature_2m'
      || '&timezone=UTC&past_days=1&forecast_days=1',
      b.merkez_lat, b.merkez_lng);

    select net.http_get(url := url, timeout_milliseconds := 15000)
      into istek_id;

    insert into hava_durumu_istekleri (id, bolge_id, enlem, boylam)
    values (istek_id, b.id, b.merkez_lat, b.merkez_lng)
    on conflict (id) do nothing;

    sayac := sayac + 1;
  end loop;

  return sayac;
end;
$$;

comment on function public.hava_durumu_istek() is
  'Her aktif bolge icin Open-Meteo saatlik sicaklik istegi kuyruga atar. '
  'Yaniti hava_durumu_topla() isler.';

-- ------------------------------------------------------------
-- 5. ADIM 2 — YANITI TOPLA VE YAZ
-- ------------------------------------------------------------
create or replace function public.hava_durumu_topla()
returns int
language plpgsql
security definer
set search_path = public, net
as $$
declare
  i record;
  yanit record;
  govde jsonb;
  zamanlar jsonb;
  sicakliklar jsonb;
  rakim numeric;
  yazilan int := 0;
  toplam int := 0;
begin
  for i in
    select * from hava_durumu_istekleri
    where islendi_mi = false
      and istek_zamani > now() - interval '2 hours'
    order by istek_zamani
  loop
    -- pg_net yaniti gelmemis olabilir; o zaman bir sonraki turda bakilir.
    select * into yanit
    from net._http_response
    where id = i.id;

    if not found then
      continue;
    end if;

    if yanit.status_code is distinct from 200 then
      update hava_durumu_istekleri
         set islendi_mi = true,
             hata = coalesce('HTTP ' || yanit.status_code, 'yanit yok') ||
                    coalesce(' — ' || left(yanit.content, 200), '')
       where id = i.id;
      continue;
    end if;

    begin
      govde := yanit.content::jsonb;
    exception when others then
      update hava_durumu_istekleri
         set islendi_mi = true, hata = 'JSON ayristirilamadi'
       where id = i.id;
      continue;
    end;

    zamanlar    := govde -> 'hourly' -> 'time';
    sicakliklar := govde -> 'hourly' -> 'temperature_2m';
    rakim       := nullif(govde ->> 'elevation', '')::numeric;

    if zamanlar is null or sicakliklar is null then
      update hava_durumu_istekleri
         set islendi_mi = true, hata = 'hourly verisi bos'
       where id = i.id;
      continue;
    end if;

    -- timezone=UTC istedigimiz icin gelen zaman damgalari UTC'dir.
    insert into hava_durumu
      (bolge_id, zaman, sicaklik_c, kaynak, enlem, boylam, rakim_m)
    select
      i.bolge_id,
      ((zamanlar ->> idx) || 'Z')::timestamptz,
      nullif(sicakliklar ->> idx, 'null')::numeric,
      'open-meteo',
      i.enlem, i.boylam, rakim
    from generate_series(0, jsonb_array_length(zamanlar) - 1) idx
    where sicakliklar ->> idx is not null
      and sicakliklar ->> idx <> 'null'
    on conflict (bolge_id, zaman, kaynak) do update
      set sicaklik_c        = excluded.sicaklik_c,
          rakim_m           = excluded.rakim_m,
          guncelleme_zamani = now();

    get diagnostics yazilan = row_count;
    toplam := toplam + yazilan;

    update hava_durumu_istekleri
       set islendi_mi = true, hata = null
     where id = i.id;
  end loop;

  -- 2 saatten eski, hala islenmemis istekler: yanit hic gelmemis demektir
  update hava_durumu_istekleri
     set islendi_mi = true, hata = 'yanit zaman asimi'
   where islendi_mi = false
     and istek_zamani <= now() - interval '2 hours';

  -- Kuyruk tablosu sonsuza kadar buyumesin
  delete from hava_durumu_istekleri
   where islendi_mi = true
     and istek_zamani < now() - interval '7 days';

  return toplam;
end;
$$;

comment on function public.hava_durumu_topla() is
  'Bekleyen Open-Meteo yanitlarini okur, hava_durumu tablosuna upsert eder.';

-- ------------------------------------------------------------
-- 6. ZAMANLAYICI
--    Saat basi istek, 3 dakika sonra toplama.
--    (Ayni saatte iki is; toplama bir onceki istegi de yakalar.)
-- ------------------------------------------------------------
do $$
begin
  perform cron.unschedule('hava-durumu-istek');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('hava-durumu-topla');
exception when others then null;
end $$;

select cron.schedule('hava-durumu-istek', '0 * * * *',
  'select public.hava_durumu_istek()');

select cron.schedule('hava-durumu-topla', '3 * * * *',
  'select public.hava_durumu_topla()');

-- ============================================================
-- KONTROL SORGULARI
-- ============================================================

-- Zamanlayicilar kuruldu mu? (2 satir beklenir)
select jobname, schedule, active
from cron.job
where jobname in ('hava-durumu-istek', 'hava-durumu-topla')
order by jobname;

-- Tablo ve indeksler
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'hava_durumu'
order by ordinal_position;

-- ILK VERI ICIN: asagidakileri ELLE calistir, aralarinda ~10 saniye bekle.
-- (Cron'un saat basini beklemek istemezsen.)
--   select public.hava_durumu_istek();
--   -- 10 saniye bekle --
--   select public.hava_durumu_topla();

-- Gelen veri (calistirdiktan sonra)
select b.ad as bolge,
       to_char(h.zaman at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI') as saat,
       h.sicaklik_c, h.rakim_m
from hava_durumu h
join bolgeler b on b.id = h.bolge_id
order by h.zaman desc
limit 24;

select 'hava durumu hazir' as durum;
