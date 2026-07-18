-- ============================================================
-- KUZEYBATI KOLU VANALARI (Isaretci 36-58) — 18 Temmuz 2026
-- Kaynak: export_2026_07_18-18_47_07.kml
-- NOT: ekim_yonu_derece ve parsel bilgileri sahadan teyit bekliyor
--      (NULL birakildi — fiskiye noktalari yon gelince cizilecek,
--      vanalar haritada hemen gorunur)
-- Supabase Dashboard > SQL Editor'da calistirin.
-- ============================================================

do $$
declare b_id uuid;
begin
  select id into b_id from bolgeler where kod = 'kayseri-ana';
  if b_id is null then
    raise exception 'kayseri-ana bolgesi bulunamadi';
  end if;

  insert into vanalar (bolge_id, isaretci_no, lat, lng, fiskiye_sayisi, yon, parsel, ekim_yonu_derece, boru_hatti, notlar)
  values
  (b_id, 36, 38.628860599947465, 36.24374529989036, 14, 'alt', null, null, 'kuzeybati-kolu', null),
  (b_id, 36, 38.628860599947465, 36.24374529989036, 11, 'ust', null, null, 'kuzeybati-kolu', null),
  (b_id, 37, 38.62897549999972, 36.243667300000396, 13, 'alt', null, null, 'kuzeybati-kolu', null),
  (b_id, 37, 38.62897549999972, 36.243667300000396, 13, 'ust', null, null, 'kuzeybati-kolu', null),
  (b_id, 38, 38.6290659, 36.2436014, 13, 'alt', null, null, 'kuzeybati-kolu', null),
  (b_id, 38, 38.6290659, 36.2436014, 13, 'ust', null, null, 'kuzeybati-kolu', null),
  (b_id, 39, 38.6291736, 36.2435386, 14, 'alt', null, null, 'kuzeybati-kolu', null),
  (b_id, 39, 38.6291736, 36.2435386, 14, 'ust', null, null, 'kuzeybati-kolu', null),
  (b_id, 40, 38.62925267424175, 36.24344553798437, 16, null, null, null, 'kuzeybati-kolu', 'Tek yonlu (yonu teyit edilecek)'),
  (b_id, 41, 38.62934359999085, 36.24334180002419, 16, null, null, null, 'kuzeybati-kolu', 'Tek yonlu (yonu teyit edilecek)'),
  (b_id, 42, 38.62940479991128, 36.24323500021294, 16, null, null, null, 'kuzeybati-kolu', 'Tek yonlu (yonu teyit edilecek)'),
  (b_id, 43, 38.62947459997976, 36.24312539998736, 14, null, null, null, 'kuzeybati-kolu', 'Tek yonlu (yonu teyit edilecek)'),
  (b_id, 44, 38.62954900012095, 36.243034200186926, 13, null, null, null, 'kuzeybati-kolu', 'Tek yonlu (yonu teyit edilecek)'),
  (b_id, 45, 38.62964528874198, 36.24285612255335, 11, null, null, null, 'kuzeybati-kolu', 'Tek yonlu (yonu teyit edilecek)'),
  (b_id, 46, 38.62971187902633, 36.24274426603453, 10, null, null, null, 'kuzeybati-kolu', 'Tek yonlu (yonu teyit edilecek)'),
  (b_id, 47, 38.62980793894914, 36.242670714855194, 3, 'alt', null, null, 'kuzeybati-kolu', null),
  (b_id, 47, 38.62980793894914, 36.242670714855194, 10, 'ust', null, null, 'kuzeybati-kolu', null),
  (b_id, 48, 38.62990851473803, 36.242599971592426, 8, 'alt', null, null, 'kuzeybati-kolu', 'Sahada "6+2" yazildi — toplam 8 kabul edildi (teyit edilecek)'),
  (b_id, 48, 38.62990851473803, 36.242599971592426, 9, 'ust', null, null, 'kuzeybati-kolu', null),
  (b_id, 49, 38.630006733145706, 36.24252788722515, 9, 'alt', null, null, 'kuzeybati-kolu', null),
  (b_id, 49, 38.630006733145706, 36.24252788722515, 9, 'ust', null, null, 'kuzeybati-kolu', null),
  (b_id, 50, 38.6300997131143, 36.242459155619144, 13, 'alt', null, null, 'kuzeybati-kolu', 'Sahada "11+2" — toplam 13 kabul edildi (teyit edilecek)'),
  (b_id, 50, 38.6300997131143, 36.242459155619144, 9, 'ust', null, null, 'kuzeybati-kolu', null),
  (b_id, 51, 38.6302041, 36.2423914, 13, 'alt', null, null, 'kuzeybati-kolu', 'Sahada "12+1" — toplam 13 kabul edildi (teyit edilecek)'),
  (b_id, 51, 38.6302041, 36.2423914, 9, 'ust', null, null, 'kuzeybati-kolu', null),
  (b_id, 52, 38.6302923720327, 36.242316920916835, 14, 'alt', null, null, 'kuzeybati-kolu', null),
  (b_id, 52, 38.6302923720327, 36.242316920916835, 9, 'ust', null, null, 'kuzeybati-kolu', null),
  (b_id, 53, 38.63039200992041, 36.24224625527859, 14, 'alt', null, null, 'kuzeybati-kolu', null),
  (b_id, 53, 38.63039200992041, 36.24224625527859, 9, 'ust', null, null, 'kuzeybati-kolu', null),
  (b_id, 54, 38.63048416917036, 36.24217879850218, 14, 'alt', null, null, 'kuzeybati-kolu', null),
  (b_id, 54, 38.63048416917036, 36.24217879850218, 9, 'ust', null, null, 'kuzeybati-kolu', null),
  (b_id, 55, 38.63058320018627, 36.24212329757932, 18, 'alt', null, null, 'kuzeybati-kolu', 'Sahada "16+2" — toplam 18 kabul edildi (teyit edilecek)'),
  (b_id, 55, 38.63058320018627, 36.24212329757932, 9, 'ust', null, null, 'kuzeybati-kolu', null),
  (b_id, 56, 38.63068589836105, 36.24205900187309, 20, 'alt', null, null, 'kuzeybati-kolu', 'Sahada "19+1" — toplam 20 kabul edildi (teyit edilecek)'),
  (b_id, 56, 38.63068589836105, 36.24205900187309, 7, 'ust', null, null, 'kuzeybati-kolu', null),
  (b_id, 57, 38.630772861030756, 36.24200779779317, 50, null, null, null, 'kuzeybati-kolu', 'OZEL: 75lik uzatma, 4 sira: 12+1 / 14 / 13 / 10 (dizilim aciklamasi bekleniyor)'),
  (b_id, 58, 38.63079899965418, 36.24199330010429, 6, 'alt', null, null, 'kuzeybati-kolu', 'OZEL: 6 fiskiye + 3 atlama (aciklama bekleniyor)'),
  (b_id, 58, 38.63079899965418, 36.24199330010429, 16, 'ust', null, null, 'kuzeybati-kolu', 'OZEL/TEYIT: 75 uzatma, yol ustu 5 AKILLI fiskiye, "1. 7 / 2. 5+4 (4+6)" — toplam kesinlesecek')
  on conflict (isaretci_no, coalesce(yon, '-')) do nothing;
end $$;

-- KONTROL: 40 yeni kayit beklenir (36-58; ciftler ayrik)
select boru_hatti, count(*) as kayit, sum(fiskiye_sayisi) as fiskiye
from vanalar group by 1 order by 1;

