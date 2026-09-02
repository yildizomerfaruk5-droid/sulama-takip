-- ============================================================
-- HAVA DURUMU — 3. ASAMA: RUZGAR, UV VE GORUNURLUK
--
-- ONKOSUL: 1. ve 2. asama migration'lari calistirilmis olmali.
--   sql/supabase_migration_hava_durumu.sql    (sicaklik)
--   sql/supabase_migration_hava_durumu_2.sql  (nem, basinc, hava kodu)
-- Bu betik onlarin UZERINE ekler; tabloyu yeniden olusturmaz, veri silmez.
--
-- EKLENEN OLCUMLER (Open-Meteo ayni cagride donduruyor, ek maliyet yok):
--   ruzgar_hiz_kmh    wind_speed_10m      (km/h)
--   ruzgar_yon        wind_direction_10m  (derece, 0=kuzey)
--   ruzgar_hamle_kmh  wind_gusts_10m      (km/h) — ani en yuksek
--   uv_index          uv_index            (birimsiz)
--   gorunurluk_m      visibility          (metre)
--
-- NOTLAR:
--   • UV gece 0'dir. "Su anki UV" tek basina yaniltici olur; arayuz
--     gunun EN YUKSEK degerini de gosterir (Kayseri 2 Eylul: 7,25).
--   • Gorunurluk metre gelir, arayuzde km'ye cevrilir.
--   • Ruzgar hamlesi (gusts) sulama acisindan onemlidir: fiskiye dagilimini
--     ortalama hiz degil, ani hamleler bozar.
--
-- GERI DOLDURMA: Upsert mevcut satiri gunceller. Bu betikten sonraki ILK
-- basarili toplamada penceredeki (~72 saat) eski satirlar da dolar.
--
-- Bu betik IDEMPOTENT'tir.
-- ============================================================

-- ------------------------------------------------------------
-- 1. YENI KOLONLAR
-- ------------------------------------------------------------
alter table hava_durumu add column if not exists ruzgar_hiz_kmh   numeric(5,2);
alter table hava_durumu add column if not exists ruzgar_yon       numeric(5,1);
alter table hava_durumu add column if not exists ruzgar_hamle_kmh numeric(5,2);
alter table hava_durumu add column if not exists uv_index         numeric(4,2);
alter table hava_durumu add column if not exists gorunurluk_m     numeric(9,1);

comment on column hava_durumu.ruzgar_yon is
  'Ruzgarin GELDIGI yon, derece (0/360 kuzey, 90 dogu, 180 guney, 270 bati).';
comment on column hava_durumu.ruzgar_hamle_kmh is
  'Ani en yuksek ruzgar. Fiskiye dagilimini ortalama hiz degil hamleler bozar.';
comment on column hava_durumu.uv_index is
  'Gece 0''dir. Tek basina gosterilmemeli; gunun en yuksegi ile birlikte anlamli.';
comment on column hava_durumu.gorunurluk_m is
  'Metre cinsinden. Arayuzde km''ye cevrilir.';

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
      || '&hourly=temperature_2m,relative_humidity_2m,surface_pressure,pressure_msl'
      || ',weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m'
      || ',uv_index,visibility'
      || '&timezone=UTC&past_days=1&forecast_days=2',
      b.merkez_lat, b.merkez_lng);

    select net.http_get(url := url, timeout_milliseconds := 15000)
      into istek_id;

    -- CAKISMA NEDEN "DO UPDATE": pg_net'in kuyruk tablolari UNLOGGED'dir.
    -- Postgres yeniden baslarsa bosalir ve istek kimligi 1'den yeniden
    -- baslar; bizim kuyrugumuzda o kimlik "islendi" durdugu icin
    -- "do nothing" yeni istegi SESSIZCE YUTAR. Cakisan kimlik her zaman
    -- geri donusturulmus eski bir kayittir, uzerine yazmak dogrudur.
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
  ruzgar_hiz jsonb;
  ruzgar_yon jsonb;
  ruzgar_hamle jsonb;
  uvler jsonb;
  gorunurlukler jsonb;
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
    ruzgar_hiz      := govde -> 'hourly' -> 'wind_speed_10m';
    ruzgar_yon      := govde -> 'hourly' -> 'wind_direction_10m';
    ruzgar_hamle    := govde -> 'hourly' -> 'wind_gusts_10m';
    uvler           := govde -> 'hourly' -> 'uv_index';
    gorunurlukler   := govde -> 'hourly' -> 'visibility';
    rakim           := nullif(govde ->> 'elevation', '')::numeric;

    if zamanlar is null or sicakliklar is null then
      update hava_durumu_istekleri
         set islendi_mi = true, hata = 'hourly verisi bos'
       where id = i.id;
      continue;
    end if;

    -- Bir olcum eksik gelirse (servis alani kaldirirsa) satir yine yazilir,
    -- ilgili kolon null kalir. Sicaklik akisi bozulmaz.
    insert into hava_durumu
      (bolge_id, zaman, sicaklik_c, nem_yuzde, basinc_hpa, basinc_deniz_hpa,
       hava_kodu, ruzgar_hiz_kmh, ruzgar_yon, ruzgar_hamle_kmh, uv_index,
       gorunurluk_m, kaynak, enlem, boylam, rakim_m)
    select
      i.bolge_id,
      ((zamanlar ->> idx) || 'Z')::timestamptz,
      nullif(sicakliklar     ->> idx, 'null')::numeric,
      nullif(nemler          ->> idx, 'null')::numeric,
      nullif(basinclar       ->> idx, 'null')::numeric,
      nullif(deniz_basinclar ->> idx, 'null')::numeric,
      nullif(kodlar          ->> idx, 'null')::smallint,
      nullif(ruzgar_hiz      ->> idx, 'null')::numeric,
      nullif(ruzgar_yon      ->> idx, 'null')::numeric,
      nullif(ruzgar_hamle    ->> idx, 'null')::numeric,
      nullif(uvler           ->> idx, 'null')::numeric,
      nullif(gorunurlukler   ->> idx, 'null')::numeric,
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
          ruzgar_hiz_kmh    = excluded.ruzgar_hiz_kmh,
          ruzgar_yon        = excluded.ruzgar_yon,
          ruzgar_hamle_kmh  = excluded.ruzgar_hamle_kmh,
          uv_index          = excluded.uv_index,
          gorunurluk_m      = excluded.gorunurluk_m,
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

-- Kolonlar eklendi mi? (5 satir beklenir)
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'hava_durumu'
  and column_name in ('ruzgar_hiz_kmh','ruzgar_yon','ruzgar_hamle_kmh',
                      'uv_index','gorunurluk_m')
order by column_name;

-- VERIYI HEMEN GORMEK ICIN: asagidakileri ELLE calistir, arada ~10 sn bekle.
--   select public.hava_durumu_istek();
--   -- 10 saniye bekle --
--   select public.hava_durumu_topla();

select 'ruzgar + uv + gorunurluk hazir' as durum;
