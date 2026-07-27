-- ============================================================
-- ZONA 2 (114 ADASI) — EKIM YONU + HAT 21-25 + AKIS DEVAMI
-- 25 Temmuz 2026
--
-- Ekim dogrultusu sahadan verilen iki noktadan hesaplandi:
--   1. nokta 38.6259983, 36.2512296
--   2. nokta 38.6269698, 36.2516779   ->  ~20 derece (KKD ekseni)
-- Vanalar parselin kuzey kenarina yakin oldugu ve ALT siralar uzun
-- (17-27 fiskiye) oldugu icin: alt = 200 (guneye), ust = 20 (kuzeye).
--
-- ONCE supabase_vanalar_59_78_hatlar_16_20.sql calistirilmis olmali.
-- Idempotent: birden fazla kez calistirilabilir.
-- ============================================================

do $$
declare
  b uuid; z1 uuid; z2 uuid; t2 uuid; turno int;
  h21 uuid; h22 uuid; h23 uuid; h24 uuid; h25 uuid;
begin
  select id into b  from bolgeler where kod = 'kayseri-ana';
  select id into z1 from zonalar where bolge_id = b order by sira_no limit 1;
  select id into z2 from zonalar where bolge_id = b order by sira_no offset 1 limit 1;

  if z2 is null then
    raise exception 'Zona 2 bulunamadi';
  end if;

  -- 1) EKIM YONU: 114 adasi vanalari (79-97)
  update vanalar set ekim_yonu_derece = 200
   where boru_hatti = 'dogu-blok';

  -- 2) Eski Hat-21..25 varsa temizle
  update vanalar v set hat_id = null from hatlar h
   where v.hat_id = h.id and h.zona_id = z2 and h.hat_no between 21 and 25;
  delete from hatlar where zona_id = z2 and hat_no between 21 and 25;

  -- 3) HATLAR (Zona 2)
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z2, 21, 1, '114/20', 0, 480) returning id into h21;
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z2, 22, 2, '114/20', 0, 480) returning id into h22;
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z2, 23, 3, '114/20', 0, 480) returning id into h23;
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z2, 24, 4, '114/20-114/21', 0, 480) returning id into h24;
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z2, 25, 5, '114/20-114/21', 0, 480) returning id into h25;

  -- 4) VANA ATAMALARI
  -- Hat-21: 93,94,95,96,97 alt (94-97 tek yonlu)
  update vanalar set hat_id = h21
   where boru_hatti = 'dogu-blok' and isaretci_no in (93,94,95,96,97)
     and (yon = 'alt' or yon is null);

  -- Hat-22: 89,90,91,92 alt
  update vanalar set hat_id = h22
   where boru_hatti = 'dogu-blok' and isaretci_no in (89,90,91,92) and yon = 'alt';

  -- Hat-23: 85,86,87,88 alt
  update vanalar set hat_id = h23
   where boru_hatti = 'dogu-blok' and isaretci_no in (85,86,87,88) and yon = 'alt';

  -- Hat-24: 79,80,81,82,83,84 alt
  update vanalar set hat_id = h24
   where boru_hatti = 'dogu-blok' and isaretci_no between 79 and 84 and yon = 'alt';

  -- Hat-25: 79-93 ust
  update vanalar set hat_id = h25
   where boru_hatti = 'dogu-blok' and isaretci_no between 79 and 93 and yon = 'ust';

  -- 5) Fiskiye toplamlari
  update hatlar h set fiskiye_sayisi = coalesce((
    select sum(v.fiskiye_sayisi) from vanalar v where v.hat_id = h.id), 0)
  where h.zona_id = z2 and h.hat_no between 21 and 25;

  -- 6) ZONA GECISI: Zona 1 turu kapandi, Zona 2 turu 25.07 14:00'te basladi
  select tur_no into turno from turlar
   where zona_id = z1 and durum = 'devam_ediyor' order by baslangic_zamani desc limit 1;
  if turno is null then turno := 2; end if;

  update turlar set durum = 'tamamlandi',
         bitis_zamani = '2026-07-25T14:00:00+03:00'
   where zona_id = z1 and durum = 'devam_ediyor';

  select id into t2 from turlar
   where zona_id = z2 and tur_no = turno and durum = 'devam_ediyor' limit 1;
  if t2 is null then
    insert into turlar (zona_id, tur_no, baslangic_zamani, durum)
    values (z2, turno, '2026-07-25T14:00:00+03:00', 'devam_ediyor')
    returning id into t2;
  end if;

  -- 7) Hat-21 aktif: 25.07 14:00 -> 22:00, sirada Hat-22
  update sistem_durumu set
    sistem_acik = true,
    aktif_hat_id = h21,
    siradaki_hat_id = h22,
    aktif_tur_id = t2,
    aktif_zona_id = z2,
    hat_baslama_zamani = '2026-07-25T14:00:00+03:00',
    guncelleme_zamani = now()
  where bolge_id = b;

  insert into olay_loglari (bolge_id, olay, detay)
  values (b, 'zona_gecisi',
    format('Zona 1 tamamlandi (%s. Su), Zona 2 - Dogu Blok basladi: Hat-21 25.07 14:00''te aktif. 114 adasi ekim yonu 200/20 derece olarak islendi.', turno));
end $$;

-- KONTROL 1: Zona 2 hatlari — beklenen 21:88, 22:73, 23:76, 24:77, 25:73
select h.hat_no, count(v.id) as vana, sum(v.fiskiye_sayisi) as fiskiye
from hatlar h left join vanalar v on v.hat_id = h.id
where h.hat_no between 21 and 25 group by 1 order by 1;

-- KONTROL 2: sistem durumu
select
  (select h.hat_no from hatlar h join sistem_durumu s on s.aktif_hat_id = h.id) as aktif_hat,
  (select hat_baslama_zamani at time zone 'Europe/Istanbul' from sistem_durumu limit 1) as baslama,
  (select z.ad from zonalar z join sistem_durumu s on s.aktif_zona_id = z.id) as zona;

-- KONTROL 3: hatta atanmamis kalan vanalar
select isaretci_no, yon, fiskiye_sayisi, boru_hatti
from vanalar where hat_id is null order by boru_hatti, isaretci_no;
