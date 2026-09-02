-- ============================================================
-- HAVA DURUMU — 4. ASAMA: YAGIS IHTIMALI VE YAGIS MIKTARI
--
-- ONKOSUL: 1., 2. ve 3. asama migration'lari calistirilmis olmali.
--   sql/supabase_migration_hava_durumu.sql    (sicaklik)
--   sql/supabase_migration_hava_durumu_2.sql  (nem, basinc, hava kodu)
--   sql/supabase_migration_hava_durumu_3.sql  (ruzgar, uv, gorunurluk)
-- Bu betik onlarin UZERINE ekler; tabloyu yeniden olusturmaz, veri silmez.
--
-- EKLENEN OLCUMLER (Open-Meteo ayni cagride donduruyor, ek maliyet yok):
--   yagis_ihtimal_yuzde  precipitation_probability  (%)
--   yagis_mm             precipitation              (mm)
--
-- IKISI NEDEN BIRDEN:
--   • Ihtimal ILERIYE dogru anlamlidir: "yarin sulamayi erteleyeyim mi?"
--   • Miktar GERIYE dogru anlamlidir: "tarla zaten ne kadar su aldi?"
--   Sulama karari icin ikincisi en az birincisi kadar degerlidir ve
--   ayni cagrida geldigi icin ayrica maliyeti yoktur.
--
--   yagis_mm kar dahil TOPLAM su esdegeridir (Open-Meteo'nun
--   "precipitation" alani; rain + showers + snowfall su karsiligi).
--
-- GERI DOLDURMA: Upsert mevcut satiri gunceller. Bu betikten sonraki ILK
-- basarili toplamada penceredeki (~72 saat) eski satirlar da dolar.
--
-- Bu betik IDEMPOTENT'tir.
-- ============================================================

-- ------------------------------------------------------------
-- 1. YENI KOLONLAR
-- ------------------------------------------------------------
alter table hava_durumu add column if not exists yagis_ihtimal_yuzde smallint;
alter table hava_durumu add column if not exists yagis_mm            numeric(6,2);

comment on column hava_durumu.yagis_ihtimal_yuzde is
  'Yagis olasiligi (%). Ileriye donuk tahmin icin anlamli.';
comment on column hava_durumu.yagis_mm is
  'O saatte dusen toplam yagis (mm, kar su esdegeri dahil). Gecmise '
  'donuk olcum: tarlanin dogadan aldigi suyu gosterir.';

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
      || ',uv_index,visibility,precipitation_probability,precipitation'
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
  yagis_ihtimal jsonb;
  yagis_miktar jsonb;
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
    yagis_ihtimal   := govde -> 'hourly' -> 'precipitation_probability';
    yagis_miktar    := govde -> 'hourly' -> 'precipitation';
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
       gorunurluk_m, yagis_ihtimal_yuzde, yagis_mm,
       kaynak, enlem, boylam, rakim_m)
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
      nullif(yagis_ihtimal   ->> idx, 'null')::smallint,
      nullif(yagis_miktar    ->> idx, 'null')::numeric,
      'open-meteo',
      i.enlem, i.boylam, rakim
    from generate_series(0, jsonb_array_length(zamanlar) - 1) idx
    where sicakliklar ->> idx is not null
      and sicakliklar ->> idx <> 'null'
    on conflict (bolge_id, zaman, kaynak) do update
      set sicaklik_c          = excluded.sicaklik_c,
          nem_yuzde           = excluded.nem_yuzde,
          basinc_hpa          = excluded.basinc_hpa,
          basinc_deniz_hpa    = excluded.basinc_deniz_hpa,
          hava_kodu           = excluded.hava_kodu,
          ruzgar_hiz_kmh      = excluded.ruzgar_hiz_kmh,
          ruzgar_yon          = excluded.ruzgar_yon,
          ruzgar_hamle_kmh    = excluded.ruzgar_hamle_kmh,
          uv_index            = excluded.uv_index,
          gorunurluk_m        = excluded.gorunurluk_m,
          yagis_ihtimal_yuzde = excluded.yagis_ihtimal_yuzde,
          yagis_mm            = excluded.yagis_mm,
          rakim_m             = excluded.rakim_m,
          guncelleme_zamani   = now();

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

-- Kolonlar eklendi mi? (2 satir beklenir)
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'hava_durumu'
  and column_name in ('yagis_ihtimal_yuzde', 'yagis_mm')
order by column_name;

-- VERIYI HEMEN GORMEK ICIN: asagidakileri ELLE calistir, arada ~10 sn bekle.
--   select public.hava_durumu_istek();
--   -- 10 saniye bekle --
--   select public.hava_durumu_topla();

select 'yagis ihtimali + miktari hazir' as durum;
