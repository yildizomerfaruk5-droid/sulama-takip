-- ============================================================
-- HAVA DURUMU — 5. ASAMA: 15 GUNLUK TAHMIN + ET0 (SU DENGESI)
--
-- ONKOSUL: 1-4. asama migration'lari calistirilmis olmali.
-- Bu betik onlarin UZERINE ekler; mevcut tabloyu yeniden olusturmaz,
-- veri silmez.
--
-- IKI YENI SEY:
--
-- 1) GUNLUK TABLO (hava_durumu_gunluk)
--    Ayni Open-Meteo cagrisina "daily" parametreleri eklendi; ek istek
--    YOK. past_days=7 + forecast_days=16 -> 23 gunluk satir:
--    7 gun gecmis + bugun + 15 gun ileri.
--
--    Neden ayri tablo: kardinalite farkli (gunde 1 satir / saatte 1
--    satir) ve alanlar toplanmis degerler (max/min/toplam). Gunluk
--    ozetleri Open-Meteo'nun kendisi hesapliyor; istemcide saatlik
--    satirlardan turetmekten daha dogru (ozellikle ET0 toplami).
--
--    SAATLIK PENCERE UZAMADI: past_hours=24 + forecast_hours=48 ile
--    saatlik veri 72 satirda tutuluyor. Bu parametreler forecast_days'ten
--    BAGIMSIZ calisir; olmasaydi saatlik de 16 gune cikip her cagride
--    ~384 satir donerdi.
--
-- 2) ET0 VE VPD (saatlik tabloya)
--    et0_mm  = et0_fao_evapotranspiration -> referans buharlasma-terleme.
--              Tarlanin o saatte KAYBETTIGI su (mm).
--    vpd_kpa = vapour_pressure_deficit    -> buharlasmayi suruklyen basinc
--              acigi; yuksekse bitki daha hizli su kaybeder.
--
--    SU DENGESI bundan cikar:  kaybedilen ET0  −  dusen yagis
--    Kayseri icin gunluk ET0 ~5 mm; yani yagmursuz bir haftada tarla
--    ~35 mm su kaybeder. Arayuz bu dengeyi gosterir.
--
--    UYARI: mm cinsinden aciği SULAMA SURESINE cevirmek icin fiskiyenin
--    saatte kac mm su verdigi (uygulama hizi) bilinmelidir. O deger
--    sistemde YOK; bu yuzden arayuz mm gosterir, saat DEGIL. Uygulama
--    hizi girilirse cevrim eklenebilir.
--
-- GERI DOLDURMA: Upsert mevcut satiri gunceller. Bu betikten sonraki ILK
-- basarili toplamada penceredeki eski satirlar da dolar.
--
-- Bu betik IDEMPOTENT'tir.
-- ============================================================

-- ------------------------------------------------------------
-- 1. SAATLIK TABLOYA ET0 VE VPD
-- ------------------------------------------------------------
alter table hava_durumu add column if not exists et0_mm  numeric(5,2);
alter table hava_durumu add column if not exists vpd_kpa numeric(5,2);

comment on column hava_durumu.et0_mm is
  'Referans buharlasma-terleme (FAO-56), mm. Tarlanin o saatte kaybettigi su.';
comment on column hava_durumu.vpd_kpa is
  'Buhar basinci acigi (kPa). Yuksekse buharlasma hizlanir.';

-- ------------------------------------------------------------
-- 2. GUNLUK TAHMIN TABLOSU
-- ------------------------------------------------------------
create table if not exists hava_durumu_gunluk (
  id uuid primary key default gen_random_uuid(),
  bolge_id uuid not null references bolgeler(id) on delete cascade,

  -- Yerel gun (Europe/Istanbul). Saat bilgisi tasimaz.
  tarih date not null,
  kaynak text not null default 'open-meteo',

  hava_kodu          smallint,
  sicaklik_max       numeric(5,2),
  sicaklik_min       numeric(5,2),
  yagis_mm           numeric(6,2),
  yagis_ihtimal_max  smallint,
  et0_mm             numeric(5,2),
  ruzgar_max_kmh     numeric(5,2),
  uv_max             numeric(4,2),
  gun_dogumu         timestamptz,
  gun_batimi         timestamptz,

  olusturma_zamani   timestamptz default now(),
  guncelleme_zamani  timestamptz default now()
);

comment on table hava_durumu_gunluk is
  'Gunluk hava ozeti: 7 gun gecmis + bugun + 15 gun ileri. Saatlik '
  'tablodan AYRI cunku kardinalite ve alanlar farkli (toplanmis degerler).';

-- Ayni bolge + gun + kaynak icin tek satir; upsert bunun uzerinden calisir.
create unique index if not exists hava_gunluk_tekil
  on hava_durumu_gunluk (bolge_id, tarih, kaynak);

create index if not exists hava_gunluk_tarih_idx
  on hava_durumu_gunluk (bolge_id, tarih desc);

-- RLS: okuma herkese acik (mevcut desen), yazma yalnizca security definer
-- fonksiyon araciligiyla.
alter table hava_durumu_gunluk enable row level security;
drop policy if exists "hava_durumu_gunluk_oku" on hava_durumu_gunluk;
create policy "hava_durumu_gunluk_oku" on hava_durumu_gunluk
  for select using (true);

-- ------------------------------------------------------------
-- 3. ISTEK — ayni cagriya daily eklendi
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
    -- TEK istek, IKI veri kumesi:
    --   hourly -> past_hours=24 + forecast_hours=48  (72 satir)
    --   daily  -> past_days=7  + forecast_days=16    (23 satir)
    -- past_hours/forecast_hours olmasaydi saatlik de 16 gune cikardi.
    url := format(
      'https://api.open-meteo.com/v1/forecast'
      || '?latitude=%s&longitude=%s'
      || '&hourly=temperature_2m,relative_humidity_2m,surface_pressure,pressure_msl'
      || ',weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m'
      || ',uv_index,visibility,precipitation_probability,precipitation'
      || ',et0_fao_evapotranspiration,vapour_pressure_deficit'
      || '&daily=weather_code,temperature_2m_max,temperature_2m_min'
      || ',precipitation_sum,precipitation_probability_max'
      || ',et0_fao_evapotranspiration,wind_speed_10m_max,uv_index_max'
      || ',sunrise,sunset'
      || '&timezone=UTC&past_days=7&forecast_days=16'
      || '&past_hours=24&forecast_hours=48',
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
-- 4. TOPLAMA — saatlik + gunluk
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
  s jsonb;   -- hourly
  g jsonb;   -- daily
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

    s     := govde -> 'hourly';
    g     := govde -> 'daily';
    rakim := nullif(govde ->> 'elevation', '')::numeric;

    if s is null or s -> 'time' is null or s -> 'temperature_2m' is null then
      update hava_durumu_istekleri
         set islendi_mi = true, hata = 'hourly verisi bos'
       where id = i.id;
      continue;
    end if;

    -- ── SAATLIK ──
    -- Bir olcum eksik gelirse satir yine yazilir, ilgili kolon null kalir.
    insert into hava_durumu
      (bolge_id, zaman, sicaklik_c, nem_yuzde, basinc_hpa, basinc_deniz_hpa,
       hava_kodu, ruzgar_hiz_kmh, ruzgar_yon, ruzgar_hamle_kmh, uv_index,
       gorunurluk_m, yagis_ihtimal_yuzde, yagis_mm, et0_mm, vpd_kpa,
       kaynak, enlem, boylam, rakim_m)
    select
      i.bolge_id,
      (((s -> 'time') ->> idx) || 'Z')::timestamptz,
      nullif((s -> 'temperature_2m')            ->> idx, 'null')::numeric,
      nullif((s -> 'relative_humidity_2m')      ->> idx, 'null')::numeric,
      nullif((s -> 'surface_pressure')          ->> idx, 'null')::numeric,
      nullif((s -> 'pressure_msl')              ->> idx, 'null')::numeric,
      nullif((s -> 'weather_code')              ->> idx, 'null')::smallint,
      nullif((s -> 'wind_speed_10m')            ->> idx, 'null')::numeric,
      nullif((s -> 'wind_direction_10m')        ->> idx, 'null')::numeric,
      nullif((s -> 'wind_gusts_10m')            ->> idx, 'null')::numeric,
      nullif((s -> 'uv_index')                  ->> idx, 'null')::numeric,
      nullif((s -> 'visibility')                ->> idx, 'null')::numeric,
      nullif((s -> 'precipitation_probability') ->> idx, 'null')::smallint,
      nullif((s -> 'precipitation')             ->> idx, 'null')::numeric,
      nullif((s -> 'et0_fao_evapotranspiration')->> idx, 'null')::numeric,
      nullif((s -> 'vapour_pressure_deficit')   ->> idx, 'null')::numeric,
      'open-meteo',
      i.enlem, i.boylam, rakim
    from generate_series(0, jsonb_array_length(s -> 'time') - 1) idx
    where (s -> 'temperature_2m') ->> idx is not null
      and (s -> 'temperature_2m') ->> idx <> 'null'
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
          et0_mm              = excluded.et0_mm,
          vpd_kpa             = excluded.vpd_kpa,
          rakim_m             = excluded.rakim_m,
          guncelleme_zamani   = now();

    get diagnostics yazilan = row_count;
    toplam := toplam + yazilan;

    -- ── GUNLUK ──
    -- Gunluk kume gelmezse (eski surum bir yanit) saatlik akis bozulmaz.
    if g is not null and g -> 'time' is not null then
      insert into hava_durumu_gunluk
        (bolge_id, tarih, kaynak, hava_kodu, sicaklik_max, sicaklik_min,
         yagis_mm, yagis_ihtimal_max, et0_mm, ruzgar_max_kmh, uv_max,
         gun_dogumu, gun_batimi)
      select
        i.bolge_id,
        ((g -> 'time') ->> idx)::date,
        'open-meteo',
        nullif((g -> 'weather_code')               ->> idx, 'null')::smallint,
        nullif((g -> 'temperature_2m_max')         ->> idx, 'null')::numeric,
        nullif((g -> 'temperature_2m_min')         ->> idx, 'null')::numeric,
        nullif((g -> 'precipitation_sum')          ->> idx, 'null')::numeric,
        nullif((g -> 'precipitation_probability_max') ->> idx, 'null')::smallint,
        nullif((g -> 'et0_fao_evapotranspiration') ->> idx, 'null')::numeric,
        nullif((g -> 'wind_speed_10m_max')         ->> idx, 'null')::numeric,
        nullif((g -> 'uv_index_max')               ->> idx, 'null')::numeric,
        -- sunrise/sunset saat dilimsiz gelir (timezone=UTC istendi)
        (nullif((g -> 'sunrise') ->> idx, 'null') || 'Z')::timestamptz,
        (nullif((g -> 'sunset')  ->> idx, 'null') || 'Z')::timestamptz
      from generate_series(0, jsonb_array_length(g -> 'time') - 1) idx
      where (g -> 'time') ->> idx is not null
      on conflict (bolge_id, tarih, kaynak) do update
        set hava_kodu         = excluded.hava_kodu,
            sicaklik_max      = excluded.sicaklik_max,
            sicaklik_min      = excluded.sicaklik_min,
            yagis_mm          = excluded.yagis_mm,
            yagis_ihtimal_max = excluded.yagis_ihtimal_max,
            et0_mm            = excluded.et0_mm,
            ruzgar_max_kmh    = excluded.ruzgar_max_kmh,
            uv_max            = excluded.uv_max,
            gun_dogumu        = excluded.gun_dogumu,
            gun_batimi        = excluded.gun_batimi,
            guncelleme_zamani = now();
    end if;

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

-- Yeni saatlik kolonlar (2 satir beklenir)
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'hava_durumu'
  and column_name in ('et0_mm', 'vpd_kpa')
order by column_name;

-- Gunluk tablo kuruldu mu?
select count(*) as gunluk_kolon_sayisi
from information_schema.columns
where table_schema = 'public' and table_name = 'hava_durumu_gunluk';

-- VERIYI HEMEN GORMEK ICIN: asagidakileri ELLE calistir, arada ~10 sn bekle.
--   select public.hava_durumu_istek();
--   -- 10 saniye bekle --
--   select public.hava_durumu_topla();

-- 15 gunluk tahmin (calistirdiktan sonra)
--   select tarih, sicaklik_min, sicaklik_max, yagis_mm, et0_mm
--   from hava_durumu_gunluk order by tarih;

-- SU DENGESI — son 7 gun (kaybedilen - dusen)
--   select round(sum(et0_mm), 1) as buharlasma_mm,
--          round(sum(yagis_mm), 1) as yagis_mm,
--          round(sum(yagis_mm) - sum(et0_mm), 1) as denge_mm
--   from hava_durumu_gunluk
--   where tarih between current_date - 7 and current_date - 1;

select '15 gunluk tahmin + ET0 hazir' as durum;
