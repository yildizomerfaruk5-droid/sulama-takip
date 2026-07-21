-- ============================================================
-- HAT TANIMLARI 10-15 (KUZEYBATI KOLU) — 21 Temmuz 2026
-- Kaynak: "yeni hatlar.txt" (listedeki hat9..hat14 -> Hat-10..Hat-15;
-- mevcut Hat-9 (isaretci 33,34,35) korundu)
--
-- Ayrica:
--   * Isaretci 58 duzeltmesi: alt 31->33, ust 6->7
--   * Isaretci 57 duzeltmesi: toplam 50->52 ve IKI PARCAYA bolunur
--     (24 fiskiye Hat-10'da, 28 fiskiye Hat-11'de)
-- Supabase Dashboard > SQL Editor'da calistirin.
-- ============================================================

-- 0) Bolunmus vana kaydi icin 'kismi' yonune izin ver
alter table vanalar drop constraint if exists vanalar_yon_check;
alter table vanalar add constraint vanalar_yon_check
  check (yon in ('alt','ust','kismi') or yon is null);

do $$
declare
  b uuid; z1 uuid;
  h10 uuid; h11 uuid; h12 uuid; h13 uuid; h14 uuid; h15 uuid;
  v57 record;
begin
  select id into b  from bolgeler where kod = 'kayseri-ana';
  select id into z1 from zonalar where bolge_id = b order by sira_no limit 1;

  -- 1) Saha duzeltmeleri
  update vanalar set fiskiye_sayisi = 33
    where boru_hatti = 'kuzeybati-kolu' and isaretci_no = 58 and yon = 'alt';
  update vanalar set fiskiye_sayisi = 7
    where boru_hatti = 'kuzeybati-kolu' and isaretci_no = 58 and yon = 'ust';

  -- Isaretci 57: 52 fiskiye, iki hatta bolunuyor
  select * into v57 from vanalar
   where boru_hatti = 'kuzeybati-kolu' and isaretci_no = 57 and yon is null;

  if v57.id is not null then
    update vanalar set fiskiye_sayisi = 24,
      notlar = '75lik uzatma; toplam 52 fiskiye — bu parca (24) Hat-10''a ait'
      where id = v57.id;

    insert into vanalar (bolge_id, hat_id, isaretci_no, lat, lng, fiskiye_sayisi,
                         yon, parsel, ekim_yonu_derece, boru_hatti, notlar)
    select v57.bolge_id, null, 57, v57.lat, v57.lng, 28,
           'kismi', v57.parsel, v57.ekim_yonu_derece, v57.boru_hatti,
           '75lik uzatma; toplam 52 fiskiye — bu parca (28) Hat-11''e ait'
    where not exists (
      select 1 from vanalar where isaretci_no = 57 and yon = 'kismi'
    );
  end if;

  -- 2) Hatlar (fiskiye toplamlari asagidaki gruplardan hesaplandi)
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 10, 10, '119/11', 80, 480) returning id into h10;
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 11, 11, '119/11', 80, 480) returning id into h11;
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 12, 12, '119/11', 86, 480) returning id into h12;
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 13, 13, '119/11', 76, 480) returning id into h13;
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 14, 14, '119/9-119/11', 87, 480) returning id into h14;
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 15, 15, '119/9-119/11', 83, 480) returning id into h15;

  -- 3) Vana atamalari
  -- Hat-10: 58 alt+ust, 57 (24'luk parca), 56 ust, 55 ust
  update vanalar set hat_id = h10 where boru_hatti = 'kuzeybati-kolu' and (
        (isaretci_no = 58)
     or (isaretci_no = 57 and yon is null)
     or (isaretci_no in (55,56) and yon = 'ust'));

  -- Hat-11: 57 (28'lik parca), 56 alt, 55 alt, 54 alt
  update vanalar set hat_id = h11 where boru_hatti = 'kuzeybati-kolu' and (
        (isaretci_no = 57 and yon = 'kismi')
     or (isaretci_no in (54,55,56) and yon = 'alt'));

  -- Hat-12: 54 ust, 53 + 52 + 51 tamami, 50 ust
  update vanalar set hat_id = h12 where boru_hatti = 'kuzeybati-kolu' and (
        (isaretci_no = 54 and yon = 'ust')
     or (isaretci_no in (51,52,53))
     or (isaretci_no = 50 and yon = 'ust'));

  -- Hat-13: 49,48,47 ust + 46,45,44,43 (tek yonluler)
  update vanalar set hat_id = h13 where boru_hatti = 'kuzeybati-kolu' and (
        (isaretci_no in (47,48,49) and yon = 'ust')
     or (isaretci_no in (43,44,45,46)));

  -- Hat-14: 50,49,48,47 alt + 39,38,37,36 alt
  update vanalar set hat_id = h14 where boru_hatti = 'kuzeybati-kolu'
     and isaretci_no in (36,37,38,39,47,48,49,50) and yon = 'alt';

  -- Hat-15: 36,37,38,39 ust + 40,41 (tek yonluler)
  update vanalar set hat_id = h15 where boru_hatti = 'kuzeybati-kolu' and (
        (isaretci_no in (36,37,38,39) and yon = 'ust')
     or (isaretci_no in (40,41)));
end $$;

-- KONTROL 1: hat basina vana/fiskiye (beklenen 80/80/86/76/87/83)
select h.hat_no, h.fiskiye_sayisi as beklenen,
       count(v.id) as vana_kaydi, coalesce(sum(v.fiskiye_sayisi), 0) as fiskiye
from hatlar h left join vanalar v on v.hat_id = h.id
where h.hat_no between 10 and 15
group by 1, 2 order by 1;

-- KONTROL 2: hicbir hatta atanmamis kalan vanalar (isaretci 42 beklenir)
select isaretci_no, yon, fiskiye_sayisi, boru_hatti
from vanalar where hat_id is null order by boru_hatti, isaretci_no;
