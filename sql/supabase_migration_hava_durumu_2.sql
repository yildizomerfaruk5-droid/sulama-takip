-- ============================================================
-- HAVA DURUMU — 2. ASAMA: NEM, BASINC VE HAVA KODU
--
-- ONKOSUL: sql/supabase_migration_hava_durumu.sql calistirilmis olmali.
-- Bu betik onun UZERINE ekler; tabloyu yeniden olusturmaz, veri silmez.
--
-- EKLENEN OLCUMLER (Open-Meteo ayni cagride donduruyor, ek maliyet yok):
--   nem_yuzde        relative_humidity_2m  (%)
--   basinc_hpa       surface_pressure      (hPa) — SAHADAKI GERCEK BASINC
--   basinc_deniz_hpa pressure_msl          (hPa) — deniz seviyesine indirgenmis
--   hava_kodu        weather_code          (WMO) — acik/bulutlu/yagisli ikonu
--
-- IKI BASINC NEDEN VAR:
--   Saha 1568 m rakimda. Oradaki gercek hava basinci ~848 hPa'dir.
--   Telefon hava uygulamalarinin gosterdigi ~1013 hPa ise "deniz
--   seviyesinde olsaydi ne olurdu" degeridir (karsilastirilabilirlik icin).
--   Ikisi de dogru, farkli seylerdir. Ileride kendi olcum istasyonunuz
--   SAHADAKI basinci olcecek -> karsilastirma basinc_hpa ile yapilmalidir,
--   basinc_deniz_hpa ile DEGIL.
--
-- PENCERE: Bu asamada forecast_days 1'den 2'ye cikarildi -> her cagri
-- ~72 saat dondurur (dun + bugun + yarin). Boylece panodaki saatlik
-- tahmin seridi gunun her saatinde en az 24 saat ileri gosterebilir.
--
-- GERI DOLDURMA: Upsert mevcut satiri gunceller. Yani bu betikten sonraki
-- ILK basarili toplamada, penceredeki eski satirlar da nem/basinc ile dolar.
--
-- Bu betik IDEMPOTENT'tir.
-- ============================================================

-- ------------------------------------------------------------
-- 1. YENI KOLONLAR
-- ------------------------------------------------------------
alter table hava_durumu add column if not exists nem_yuzde        numeric(5,2);
alter table hava_durumu add column if not exists basinc_hpa       numeric(6,2);
alter table hava_durumu add column if not exists basinc_deniz_hpa numeric(6,2);
alter table hava_durumu add column if not exists hava_kodu        smallint;

comment on column hava_durumu.basinc_hpa is
  'Sahadaki gercek basinc (surface_pressure). Rakim yuksekse deniz '
  'seviyesi degerinden belirgin dusuktur. Olcum istasyonu karsilastirmasi bununla yapilir.';
comment on column hava_durumu.basinc_deniz_hpa is
  'Deniz seviyesine indirgenmis basinc (pressure_msl). Telefon hava '
  'uygulamalarinin gosterdigi deger budur; sahada olculen bu degildir.';
comment on column hava_durumu.hava_kodu is
  'WMO hava kodu (0 acik, 1-3 bulutlanma, 45/48 sis, 51-67 yagmur, '
  '71-77 kar, 80-82 saganak, 95-99 firtina).';

-- ------------------------------------------------------------
-- 2. ISTEK — URL'ye yeni olcumler eklendi
-- ------------------------------------------------------------
create or replace function public.hava_durumu_istek()
returns int
language plpgsql
security definer
set search_path = public, net
as $fn$
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
    -- past_days=1 + forecast_days=2 -> ~72 saatlik pencere:
    -- dun + bugun + yarin. Panodaki saatlik seridin her saatte en az
    -- 24 saat ileri gosterebilmesi icin forecast_days=2 gerekiyor.
    -- Kacan saatler bir sonraki basarili cagride geri dolar.
    url := format(
      'https://api.open-meteo.com/v1/forecast'
      || '?latitude=%s&longitude=%s'
      || '&hourly=temperature_2m,relative_humidity_2m,surface_pressure,pressure_msl,weather_code'
      || '&timezone=UTC&past_days=1&forecast_days=2',
      b.merkez_lat, b.merkez_lng);

    select net.http_get(url := url, timeout_milliseconds := 15000)
      into istek_id;

    -- ⚠️ CAKISMA NEDEN "DO UPDATE" OLMALI:
    --   pg_net'in kuyruk tablolari UNLOGGED'dir. Postgres yeniden
    --   baslarsa (Supabase bakimi, surum yukseltmesi, cokme) bu tablolar
    --   bosalir ve istek kimligi sayaci 1'DEN YENIDEN BASLAR. Bizim
    --   kuyrugumuzda o kimlikler hala "islendi" olarak durdugu icin
    --   "do nothing" yeni istegi SESSIZCE YUTAR ve veri toplanmaz --
    --   ta ki kimlikler eski en buyuk degeri gecene kadar (gunler surebilir).
    --   Cakisan kimlik her zaman geri donusturulmus eski bir kayittir
    --   (istekler 2 saat icinde islenir), bu yuzden uzerine yazmak dogrudur.
    insert into hava_durumu_istekleri (id, bolge_id, enlem, boylam)
    values (istek_id, b.id, b.merkez_lat, b.merkez_lng)
    on conflict (id) do update
      set bolge_id     = excluded.bolge_id,
          enlem        = excluded.enlem,
          boylam       = excluded.boylam,
          istek_zamani = now(),
          islendi_mi   = false,
          hata         = null;

    sayac := sayac + 1;
  end loop;

  return sayac;
end;
$fn$;

-- ------------------------------------------------------------
-- 3. TOPLAMA — yeni dizileri de yazar
-- ------------------------------------------------------------
create or replace function public.hava_durumu_topla()
returns int
language plpgsql
security definer
set search_path = public, net
as $fn$
declare
  i record;
  yanit record;
  govde jsonb;
  zamanlar jsonb;
  sicakliklar jsonb;
  nemler jsonb;
  basinclar jsonb;
  deniz_basinclar jsonb;
  kodlar jsonb;
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

    zamanlar        := govde -> 'hourly' -> 'time';
    sicakliklar     := govde -> 'hourly' -> 'temperature_2m';
    nemler          := govde -> 'hourly' -> 'relative_humidity_2m';
    basinclar       := govde -> 'hourly' -> 'surface_pressure';
    deniz_basinclar := govde -> 'hourly' -> 'pressure_msl';
    kodlar          := govde -> 'hourly' -> 'weather_code';
    rakim           := nullif(govde ->> 'elevation', '')::numeric;

    if zamanlar is null or sicakliklar is null then
      update hava_durumu_istekleri
         set islendi_mi = true, hata = 'hourly verisi bos'
       where id = i.id;
      continue;
    end if;

    -- Yeni olcumler eksik gelirse (servis alani kaldirirsa) satir yine
    -- yazilir, ilgili kolon null kalir. Sicaklik akisi bozulmaz.
    insert into hava_durumu
      (bolge_id, zaman, sicaklik_c, nem_yuzde, basinc_hpa, basinc_deniz_hpa,
       hava_kodu, kaynak, enlem, boylam, rakim_m)
    select
      i.bolge_id,
      ((zamanlar ->> idx) || 'Z')::timestamptz,
      nullif(sicakliklar     ->> idx, 'null')::numeric,
      nullif(nemler          ->> idx, 'null')::numeric,
      nullif(basinclar       ->> idx, 'null')::numeric,
      nullif(deniz_basinclar ->> idx, 'null')::numeric,
      nullif(kodlar          ->> idx, 'null')::smallint,
      'open-meteo',
      i.enlem, i.boylam, rakim
    from generate_series(0, jsonb_array_length(zamanlar) - 1) idx
    where sicakliklar ->> idx is not null
      and sicakliklar ->> idx <> 'null'
    on conflict (bolge_id, zaman, kaynak) do update
      set sicaklik_c        = excluded.sicaklik_c,
          nem_yuzde         = excluded.nem_yuzde,
          basinc_hpa        = excluded.basinc_hpa,
          basinc_deniz_hpa  = excluded.basinc_deniz_hpa,
          hava_kodu         = excluded.hava_kodu,
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
$fn$;

-- ============================================================
-- KONTROL
-- ============================================================

-- Kolonlar eklendi mi? (4 satir beklenir)
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'hava_durumu'
  and column_name in ('nem_yuzde','basinc_hpa','basinc_deniz_hpa','hava_kodu')
order by column_name;

-- VERIYI HEMEN GORMEK ICIN: asagidakileri ELLE calistir, arada ~10 sn bekle.
--   select public.hava_durumu_istek();
--   -- 10 saniye bekle --
--   select public.hava_durumu_topla();

select 'nem + basinc hazir' as durum;
