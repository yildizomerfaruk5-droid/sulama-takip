-- ============================================================
-- KURULUM SIHIRBAZI — ASAMA 1 SEED: KAYSERI SABIT VERISI (29 Temmuz 2026)
-- Kaynak spesifikasyon: KURULUM_SIHIRBAZI_SPEC.md  Bolum 6.2 - 6.4
-- Kaynak veri       : src/harita.js (PARSELLER, ANA_BORU_HATLARI,
--                     KUYU, T_NOKTASI, VANA_NOKTALARI, ozel kural sabitleri)
--
-- ONKOSUL: sql/supabase_migration_kurulum_tablolari.sql calistirilmis olmali.
--
-- BU DOSYA CALISAN SISTEMI ETKILEMEZ:
--   * Yalnizca yeni tablolara yazar.
--   * vanalar tablosunda SADECE yeni kolonlara (parsel_id, cizim_kurali) dokunur.
--   * Hicbir kayit silinmez, hicbir mevcut kolon degistirilmez.
--   * harita.js hala kendi sabit dizilerini kullanir — veri bu asamada
--     bilerek iki yerde durur (asama 2'de kod veriye baglanacak).
--
-- IDEMPOTENT: birden fazla kez calistirilabilir.
-- DIKKAT: parsel / boru / nokta kayitlari "on conflict do update" ile
--         koddaki degerlere GERI DONER. Sihirbazdan elle duzenleme
--         yapildiktan sonra bu dosya tekrar calistirilmamalidir.
-- Supabase Dashboard > SQL Editor'da calistirin.
-- ============================================================

do $$
declare b_id uuid;
begin
  select id into b_id from bolgeler where kod = 'kayseri-ana';
  if b_id is null then
    raise exception 'kayseri-ana bolgesi bulunamadi — once supabase_migration_bolgeler.sql calistirin';
  end if;

  -- ==========================================================
  -- 1. PARSELLER (7 adet) — harita.js:11 PARSELLER
  --    Koordinat sirasi: [lng, lat]  (GeoJSON — cizimde ters cevrilir)
  -- ==========================================================
  insert into parseller (bolge_id, ad, alan_m2, koordinatlar, renk, sira_no)
  values
  (b_id, '114/20', 29446.94, '[[36.25107,38.62688],[36.25097,38.62666],[36.25082,38.6263],[36.25075,38.62605],[36.25086,38.62604],[36.25108,38.62598],[36.25127,38.62596],[36.25149,38.62596],[36.25172,38.62599],[36.25209,38.62608],[36.25237,38.62614],[36.25265,38.62624],[36.25273,38.62668],[36.25279,38.62699],[36.25284,38.6271],[36.25286,38.62723],[36.25283,38.62729],[36.25271,38.62741],[36.25258,38.62754],[36.25245,38.62774],[36.25233,38.62786],[36.25214,38.62794],[36.25195,38.628],[36.2518,38.62803],[36.25172,38.62804],[36.25164,38.62802],[36.25153,38.62796],[36.25141,38.62786],[36.25134,38.62779],[36.25128,38.62772],[36.25124,38.62761],[36.25125,38.62744],[36.25122,38.6273],[36.25109,38.62703],[36.25107,38.62688]]'::jsonb, '#3fae4a', 1),
  (b_id, '114/39', 4367.45, '[[36.25107,38.62688],[36.25109,38.62703],[36.25102,38.62694],[36.251,38.62695],[36.25106,38.62714],[36.25112,38.62731],[36.25117,38.62751],[36.25119,38.62767],[36.25123,38.62785],[36.25122,38.62799],[36.2512,38.62801],[36.25117,38.62801],[36.25109,38.62795],[36.25106,38.62793],[36.25103,38.62786],[36.25103,38.62779],[36.25104,38.62763],[36.25104,38.62749],[36.25099,38.62734],[36.25094,38.62718],[36.25088,38.62704],[36.25082,38.62683],[36.25068,38.62655],[36.25064,38.62653],[36.25064,38.62651],[36.25059,38.6264],[36.25052,38.62633],[36.25034,38.62607],[36.25027,38.62595],[36.25024,38.62588],[36.2503,38.62589],[36.25038,38.6259],[36.25047,38.62594],[36.25055,38.62598],[36.25066,38.62603],[36.25075,38.62605],[36.25082,38.6263],[36.25097,38.62666],[36.25107,38.62688]]'::jsonb, '#3fae4a', 2),
  (b_id, '114/21', 7481.60, '[[36.25104,38.62749],[36.25104,38.62763],[36.25103,38.62779],[36.25103,38.62786],[36.25106,38.62793],[36.25109,38.62795],[36.25108,38.62805],[36.25106,38.62809],[36.251,38.62813],[36.25081,38.6281],[36.25058,38.62802],[36.2504,38.62797],[36.25029,38.62788],[36.25032,38.62764],[36.25037,38.62731],[36.25046,38.62705],[36.25058,38.62676],[36.25068,38.62655],[36.25082,38.62683],[36.25088,38.62704],[36.25094,38.62718],[36.25099,38.62734],[36.25104,38.62749]]'::jsonb, '#3fae4a', 3),
  (b_id, '119/11', 50122.28, '[[36.24374,38.63085],[36.24369,38.63092],[36.24361,38.63099],[36.24369,38.63109],[36.24389,38.63127],[36.24419,38.63154],[36.24429,38.63162],[36.24445,38.63174],[36.24442,38.63181],[36.24437,38.63187],[36.24422,38.63203],[36.24403,38.63223],[36.24385,38.63243],[36.24374,38.63255],[36.24363,38.63248],[36.24358,38.63242],[36.24352,38.63238],[36.24347,38.63232],[36.2437,38.63212],[36.24371,38.63209],[36.24366,38.63204],[36.24354,38.63196],[36.2434,38.63186],[36.2433,38.63176],[36.24318,38.63161],[36.24305,38.63145],[36.24296,38.63134],[36.24287,38.63116],[36.24276,38.63099],[36.2427,38.63094],[36.24262,38.63091],[36.24254,38.63093],[36.24244,38.631],[36.24225,38.63093],[36.24213,38.63091],[36.24193,38.63089],[36.24168,38.63081],[36.24167,38.63077],[36.2416,38.63068],[36.24136,38.6304],[36.24119,38.63023],[36.24119,38.6302],[36.24133,38.63003],[36.24142,38.62994],[36.24152,38.62981],[36.24165,38.62965],[36.24173,38.62953],[36.24177,38.62941],[36.24176,38.6293],[36.24176,38.62907],[36.24172,38.62861],[36.24196,38.62857],[36.24222,38.62853],[36.24251,38.62847],[36.24266,38.62843],[36.24289,38.62832],[36.24322,38.62813],[36.2431,38.62828],[36.24298,38.62843],[36.24284,38.62861],[36.24271,38.62877],[36.2427,38.62879],[36.24315,38.62902],[36.24355,38.62921],[36.24325,38.62942],[36.24303,38.62954],[36.24287,38.62964],[36.24277,38.62972],[36.2428,38.62978],[36.24291,38.62988],[36.243,38.62996],[36.24321,38.63014],[36.24338,38.63031],[36.24358,38.63059],[36.24369,38.63076],[36.24374,38.63085]]'::jsonb, '#3fae4a', 4),
  (b_id, '119/9', 52776.58, '[[36.24543,38.62866],[36.2455,38.62874],[36.24544,38.62886],[36.24522,38.62916],[36.24511,38.62934],[36.24502,38.62954],[36.24497,38.62968],[36.24494,38.62981],[36.24459,38.62965],[36.24436,38.62955],[36.24414,38.62946],[36.24392,38.62937],[36.24372,38.62928],[36.24355,38.62921],[36.24315,38.62902],[36.2427,38.62879],[36.24271,38.62877],[36.24284,38.62861],[36.24298,38.62843],[36.2431,38.62828],[36.24322,38.62813],[36.24335,38.62805],[36.24351,38.62797],[36.24379,38.6278],[36.24403,38.62766],[36.24416,38.62756],[36.24434,38.62741],[36.24463,38.62716],[36.24477,38.62704],[36.24498,38.62679],[36.24512,38.62665],[36.24528,38.62651],[36.24533,38.62647],[36.24543,38.62642],[36.24555,38.62637],[36.24573,38.62629],[36.24585,38.62619],[36.24593,38.62608],[36.24597,38.62604],[36.24605,38.62603],[36.24608,38.62616],[36.2461,38.62625],[36.24609,38.62636],[36.24607,38.62651],[36.24604,38.62665],[36.24605,38.62671],[36.24611,38.62675],[36.24613,38.62687],[36.2461,38.627],[36.24603,38.62712],[36.24596,38.6272],[36.24575,38.62739],[36.24555,38.62763],[36.2455,38.62776],[36.24546,38.62793],[36.24544,38.62802],[36.24528,38.62817],[36.24522,38.62829],[36.24524,38.62837],[36.24534,38.62851],[36.24543,38.62866]]'::jsonb, '#3fae4a', 5),
  (b_id, '119/7', 66944.40, '[[36.24596,38.62866],[36.24624,38.62874],[36.2465,38.62888],[36.24664,38.62894],[36.24711,38.62912],[36.24732,38.62921],[36.24762,38.62932],[36.24792,38.62941],[36.24816,38.62949],[36.24837,38.62958],[36.24845,38.62963],[36.24857,38.62979],[36.24864,38.6299],[36.24864,38.62999],[36.2486,38.6301],[36.24843,38.63034],[36.24823,38.63062],[36.2481,38.63076],[36.24792,38.63092],[36.24781,38.63102],[36.24764,38.63116],[36.24743,38.63135],[36.24715,38.63151],[36.24678,38.63134],[36.24645,38.63123],[36.24557,38.6309],[36.24492,38.63067],[36.24481,38.63064],[36.24486,38.63041],[36.24497,38.63012],[36.245,38.63005],[36.24501,38.62986],[36.24501,38.6297],[36.24508,38.62949],[36.24517,38.62933],[36.24534,38.6291],[36.24545,38.62893],[36.24551,38.62881],[36.2456,38.62855],[36.24596,38.62866]]'::jsonb, '#3fae4a', 6),
  (b_id, '119/6', 25368.54, '[[36.24566,38.63175],[36.24534,38.6321],[36.24498,38.6325],[36.24479,38.6327],[36.24462,38.63289],[36.24446,38.63306],[36.24438,38.63302],[36.24428,38.63295],[36.24404,38.63276],[36.24388,38.63266],[36.24374,38.63255],[36.24385,38.63243],[36.24403,38.63223],[36.24422,38.63203],[36.24437,38.63187],[36.24455,38.63174],[36.24475,38.63152],[36.24484,38.63137],[36.24502,38.63107],[36.24472,38.63099],[36.24475,38.63082],[36.24481,38.63064],[36.24492,38.63067],[36.24557,38.6309],[36.24645,38.63123],[36.24678,38.63134],[36.24715,38.63151],[36.24681,38.63175],[36.24662,38.63164],[36.2464,38.63153],[36.24605,38.63135],[36.2458,38.63162],[36.24566,38.63175]]'::jsonb, '#3fae4a', 7)
  on conflict (bolge_id, ad) do update
    set alan_m2      = excluded.alan_m2,
        koordinatlar = excluded.koordinatlar,
        renk         = excluded.renk,
        sira_no      = excluded.sira_no;

  -- ==========================================================
  -- 2. ANA BORU HATLARI (8 segment) — harita.js:46 ANA_BORU_HATLARI
  --    Koordinat sirasi: [lat, lng]  (Leaflet polyline — parsellerden FARKLI)
  --    DMS degerleri harita.js'deki dms() ile ayni sonuca acilmistir.
  -- ==========================================================
  insert into boru_hatlari (bolge_id, ad, tip, koordinatlar, renk, kesikli, sira_no)
  values
  (b_id, 'Kuyu → T', 'ana', '[[38.629583333333336,36.24502777777778],[38.62975,36.245]]'::jsonb, '#00e5ff', false, 1),
  (b_id, 'Vana 1 - ana', 'ana', '[[38.62975,36.245],[38.629222222222225,36.24352777777778]]'::jsonb, '#2196f3', false, 2),
  (b_id, 'Vana 1 - kısa kol', 'ana', '[[38.629222222222225,36.24352777777778],[38.62883333333333,36.24388888888889]]'::jsonb, '#2196f3', true, 3),
  (b_id, 'Vana 1 - uzun kol', 'ana', '[[38.629222222222225,36.24352777777778],[38.629694444444446,36.24275],[38.63077777777778,36.242000000000004]]'::jsonb, '#2196f3', false, 4),
  (b_id, 'Vana 2', 'ana', '[[38.62975,36.245],[38.62994444444445,36.24502777777778],[38.63102777777778,36.24738888888889]]'::jsonb, '#2196f3', false, 5),
  (b_id, 'Vana 3 - ana', 'ana', '[[38.62975,36.245],[38.62852777777778,36.245583333333336]]'::jsonb, '#2196f3', false, 6),
  (b_id, 'Vana 3 - 119 grubu', 'ana', '[[38.62852777777778,36.245583333333336],[38.628277777777775,36.24525],[38.628,36.245444444444445],[38.62672222222222,36.24611111111111]]'::jsonb, '#2196f3', false, 7),
  (b_id, 'Vana 3 - 114 grubu', 'ana', '[[38.62852777777778,36.245583333333336],[38.62861111111111,36.24652777777778],[38.62822222222222,36.24755555555556],[38.62755555555555,36.24886111111111],[38.627694444444444,36.250277777777775],[38.62713888888889,36.253]]'::jsonb, '#1565c0', false, 8)
  on conflict (bolge_id, ad) do update
    set tip          = excluded.tip,
        koordinatlar = excluded.koordinatlar,
        renk         = excluded.renk,
        kesikli      = excluded.kesikli,
        sira_no      = excluded.sira_no;

  -- ==========================================================
  -- 3. SAHA NOKTALARI — kuyu + T + 2 ayrim noktasi
  --    harita.js:43-44 (KUYU, T_NOKTASI) ve :57 (VANA_NOKTALARI)
  --    ikon NULL birakildi: mevcut cizim daire isaretidir, emoji degil.
  -- ==========================================================
  insert into saha_noktalari (bolge_id, tip, ad, lat, lng, ikon, notlar)
  values
  (b_id, 'kuyu',  'Sulama Kuyusu',           38.629583333333336, 36.24502777777778, null, null),
  (b_id, 'ayrim', '4''lü T - Ana Dağıtım',   38.62975,           36.245,            null, 'Ana dagitim noktasi — 4''lu T'),
  (b_id, 'ayrim', 'Vana 1 - Ayrım Noktası',  38.629222222222225, 36.24352777777778, null, null),
  (b_id, 'ayrim', 'Vana 3 - Ayrım Noktası',  38.62852777777778,  36.245583333333336, null, null)
  on conflict (bolge_id, tip, coalesce(ad, '-')) do update
    set lat    = excluded.lat,
        lng    = excluded.lng,
        ikon   = excluded.ikon,
        notlar = excluded.notlar;

  -- ==========================================================
  -- 4. VANA -> PARSEL ESLEMESI (96 isaretci / 136 vana kaydi)
  --    Mevcut motor parseli metinle esler: parsel.includes(p.id)
  --    ('119/7-119/6' -> hem 119/7 hem 119/6). Ayni mantik LIKE ile
  --    birebir tekrarlanir; boylece kirpma alani degismez.
  -- ==========================================================
  insert into vana_parselleri (vana_id, parsel_id)
  select v.id, p.id
  from vanalar v
  join parseller p
    on p.bolge_id = v.bolge_id
   and v.parsel like '%' || p.ad || '%'
  where v.bolge_id = b_id
    and v.parsel is not null
  on conflict (vana_id, parsel_id) do nothing;

  -- Birincil parsel: metinde ilk gecen parsel (orn. '119/7-119/6' -> 119/7)
  -- Zaten atanmis olanlara dokunulmaz (elle duzeltmeler korunur).
  update vanalar v
  set parsel_id = (
    select p.id from parseller p
    where p.bolge_id = v.bolge_id
      and v.parsel like '%' || p.ad || '%'
    order by position(p.ad in v.parsel), length(p.ad) desc
    limit 1
  )
  where v.bolge_id = b_id
    and v.parsel is not null
    and v.parsel_id is null;

  -- ==========================================================
  -- 5. OZEL CIZIM KURALLARI (spec 6.4 — 7 kural tipi, 8 vana kaydi:
  --    33 alt ve 34 alt ayni kurali paylasir)
  --    Kaynak: harita.js icindeki sabit kontroller.
  --    Kurallar bu asamada YALNIZCA veri olarak durur; cizim motoru
  --    asama 2'de bu alani okumaya baslayacak.
  -- ==========================================================

  -- 5.1 Vana 1 — yan sira dizilimi (ana 8 + 12m'de 5 + 24m'de 4 = 17)
  --     Yon referansi: komsu vana 2'den bu vanaya dogru (harita.js:499)
  update vanalar set cizim_kurali = '{
    "tip": "yan_sira",
    "ana": 8,
    "yon_referans": { "komsu_isaretci": 2 },
    "siralar": [ { "kaydirma_m": 12, "adet": 5 }, { "kaydirma_m": 24, "adet": 4 } ]
  }'::jsonb
  where bolge_id = b_id and isaretci_no = 1 and yon is null;

  -- 5.2 Vana 19 — yan sira dizilimi (ana 9 + 12m'de 7 + 24m'de 4 = 20)
  update vanalar set cizim_kurali = '{
    "tip": "yan_sira",
    "ana": 9,
    "yon_referans": { "komsu_isaretci": 18 },
    "siralar": [ { "kaydirma_m": 12, "adet": 7 }, { "kaydirma_m": 24, "adet": 4 } ]
  }'::jsonb
  where bolge_id = b_id and isaretci_no = 19 and yon is null;

  -- 5.3 Vana 12 — kirpmasiz sabit uzunluk (harita.js:376 KIRPMASIZ_SABIT)
  --     Poligon girintisi yuzunden yanlis kirpiliyordu; 33 pozisyon sabit cizilir.
  update vanalar set cizim_kurali = '{ "tip": "sabit", "adet": 33 }'::jsonb
  where bolge_id = b_id and isaretci_no = 12 and yon is null;

  -- 5.4 Vana 32 alt — parsel sonuna kadar uzat (harita.js:372 UZAT)
  --     Motor 80 pozisyona kadar dener, parsel siniri kirpar.
  update vanalar set cizim_kurali = '{ "tip": "uzat", "maks": 80 }'::jsonb
  where bolge_id = b_id and isaretci_no = 32 and yon = 'alt';

  -- 5.5 Vana 33 alt ve 34 alt — ekilmemis bosluk (harita.js:369 BOSLUKLU)
  --     16. fiskiyeden sonra 3 aralik (30 m) atlanir, kalani kaydirilir.
  update vanalar set cizim_kurali = '{ "tip": "bosluk", "sonra": 16, "atlama": 3 }'::jsonb
  where bolge_id = b_id and isaretci_no in (33, 34) and yon = 'alt';

  -- 5.6 Vana 35 — parsel kenarini takip et (harita.js:482 kenarBoyuncaNoktalar)
  --     119/7'nin alt kenar cizgisi boyunca, basta 4 pozisyon kaydirilmis.
  update vanalar set cizim_kurali = '{
    "tip": "kenar",
    "parsel_ad": "119/7",
    "baslangic_kaydirma": 4
  }'::jsonb
  where bolge_id = b_id and isaretci_no = 35;

  -- 5.7 Vana 58 alt — alan doldurma (harita.js:434 kalanParcayiDoldur)
  --     119/11'in kalan kuzeybati parcasi: boru yonu 326, sira araligi 12 m,
  --     ekim ekseni 60/240, parsel siniriyla kirpilir.
  update vanalar set cizim_kurali = '{
    "tip": "alan_doldur",
    "parsel_ad": "119/11",
    "boru_yonu": 326,
    "sira_araligi_m": 12,
    "maks_sira": 45,
    "maks_fiskiye": 60
  }'::jsonb
  where bolge_id = b_id and isaretci_no = 58 and yon = 'alt';

  -- ==========================================================
  -- 6. BOLGE AYARLARI — harita.js sabitleriyle ayni degerler
  --    kurulum_tamam BILEREK false birakildi: harita.js hala sabit
  --    veriyi kullaniyor. Asama 2'deki karsilastirma bittiginde acilacak.
  -- ==========================================================
  update bolgeler set
    fiskiye_araligi_m  = 10,   -- harita.js FISKIYE_ARALIK
    fiskiye_kapsama_m  = 7,    -- harita.js FISKIYE_KAPSAMA
    fiskiye_alan_m2    = 120,
    varsayilan_sure_dk = 480
  where id = b_id;

end $$;

-- ============================================================
-- KONTROL SORGULARI
-- ============================================================

-- 1) Tablo basina satir sayisi.
--    Beklenen (mevcut migration'lardan hesaplanmistir):
--      parseller                 7
--      boru_hatlari              8
--      saha_noktalari            4
--      vanalar (kayit satiri)  136   -- 96 farkli isaretci; alt/ust ayri satir
--      vanalar (farkli isaretci) 96   -- 1-20 ve 22-97 (21 numarali isaretci yok)
--      vanalar (parsel_id dolu) 129   -- parseli bos olan 40-46 haric (7 kayit)
--      cizim_kurali dolu vana     8   -- 7 kural tipi (33 alt + 34 alt ayni kural)
--
--      vana_parselleri: SABIT SAYI YOK. Her vananin `parsel` metnindeki
--      parsel adi kadar satir olusur (orn. '119/7-119/6' -> 2 satir).
--      Dogru kontrol asagidaki 4. sorgudur: metinle iliski tablosu
--      arasinda fark olmamalidir.
--      (31 Temmuz 2026 itibariyla uretimdeki deger: 156 — 36-39 numarali
--       vanalar sahada '119/9-119/11' olarak duzeltildigi icin cift parselli.)
with b as (select id from bolgeler where kod = 'kayseri-ana')
select 'parseller'                as tablo, count(*) as satir from parseller      where bolge_id = (select id from b)
union all
select 'boru_hatlari',                     count(*) from boru_hatlari   where bolge_id = (select id from b)
union all
select 'saha_noktalari',                   count(*) from saha_noktalari where bolge_id = (select id from b)
union all
select 'vanalar (kayit satiri)',           count(*) from vanalar        where bolge_id = (select id from b)
union all
select 'vanalar (farkli isaretci)', count(distinct isaretci_no) from vanalar where bolge_id = (select id from b)
union all
select 'vanalar (parsel_id dolu)',         count(*) from vanalar        where bolge_id = (select id from b) and parsel_id is not null
union all
select 'vana_parselleri',                  count(*) from vana_parselleri vp
  join vanalar v on v.id = vp.vana_id where v.bolge_id = (select id from b)
union all
select 'cizim_kurali dolu vana',           count(*) from vanalar        where bolge_id = (select id from b) and cizim_kurali is not null;

-- 2) Ozel kural atanan vanalar — beklenen 8 satir
--    1 · 12 · 19 · 32 alt · 33 alt · 34 alt · 35 alt · 58 alt
select v.isaretci_no,
       coalesce(v.yon, '-')            as yon,
       v.fiskiye_sayisi,
       v.cizim_kurali->>'tip'          as kural_tipi,
       v.cizim_kurali                  as kural
from vanalar v
where v.bolge_id = (select id from bolgeler where kod = 'kayseri-ana')
  and v.cizim_kurali is not null
order by v.isaretci_no, v.yon nulls first;

-- 3) Vana -> parsel eslemesi ozeti (metin ile tablo tutarli mi?)
select coalesce(v.parsel, '(bos)') as parsel_metni,
       count(distinct v.id)        as vana_kaydi,
       count(vp.parsel_id)         as eslesen_parsel_satiri,
       string_agg(distinct p.ad, ', ' order by p.ad) as eslesen_parseller
from vanalar v
left join vana_parselleri vp on vp.vana_id = v.id
left join parseller p        on p.id = vp.parsel_id
where v.bolge_id = (select id from bolgeler where kod = 'kayseri-ana')
group by 1
order by 1;
-- Beklenen: '119/7-119/6' -> her vana 2 parsel (19 vana, 38 satir);
-- digerleri 1'er; parseli bos olan 40-46 vanalari (7 kayit) eslesmez —
-- motor zaten o vanalarda kirpma uygulamiyor.

-- 4) Parsel adlarinin tamami eslesti mi? (hicbir vana parsel metni bosta kalmasin)
select v.isaretci_no, v.yon, v.parsel
from vanalar v
where v.bolge_id = (select id from bolgeler where kod = 'kayseri-ana')
  and v.parsel is not null
  and not exists (select 1 from vana_parselleri vp where vp.vana_id = v.id)
order by v.isaretci_no;
-- Beklenen: 0 satir
