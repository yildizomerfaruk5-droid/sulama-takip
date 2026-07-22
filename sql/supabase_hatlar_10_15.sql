-- ============================================================
-- HAT TANIMLARI 10-15 (KUZEYBATI KOLU) — GUNCEL (21 Temmuz 2026)
-- Kaynak: "yeni hatlar.txt" (revize gruplama)
-- Bu dosya calisan Hat-9'a ve sistem_durumu'na DOKUNMAZ;
-- yalnizca Hat-10..15 tanimlarini (varsa eskisini silip) yeniden kurar.
-- Idempotent: birden fazla kez calistirilabilir.
-- Supabase Dashboard > SQL Editor'da calistirin.
-- ============================================================

-- 0) 'kismi' yonune izin (57 bolunmesi icin)
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

  -- 1) Saha duzeltmeleri (idempotent)
  update vanalar set fiskiye_sayisi = 33
    where boru_hatti = 'kuzeybati-kolu' and isaretci_no = 58 and yon = 'alt';
  update vanalar set fiskiye_sayisi = 7
    where boru_hatti = 'kuzeybati-kolu' and isaretci_no = 58 and yon = 'ust';

  -- Isaretci 57: 52 fiskiye, 24 (null-kayit) + 28 (kismi-kayit)
  select * into v57 from vanalar
   where boru_hatti = 'kuzeybati-kolu' and isaretci_no = 57 and yon is null;
  if v57.id is not null then
    update vanalar set fiskiye_sayisi = 24,
      notlar = '75lik uzatma; toplam 52 fiskiye — bu parca (24) Hat-10''a'
      where id = v57.id;
    insert into vanalar (bolge_id, isaretci_no, lat, lng, fiskiye_sayisi,
                         yon, parsel, ekim_yonu_derece, boru_hatti, notlar)
    select v57.bolge_id, 57, v57.lat, v57.lng, 28,
           'kismi', v57.parsel, v57.ekim_yonu_derece, v57.boru_hatti,
           '75lik uzatma; toplam 52 fiskiye — bu parca (28) Hat-11''e'
    where not exists (select 1 from vanalar where isaretci_no = 57 and yon = 'kismi');
  end if;

  -- 2) Eski Hat-10..15 varsa temizle (yeniden kurmak icin)
  update vanalar v set hat_id = null
    from hatlar h
    where v.hat_id = h.id and h.zona_id = z1 and h.hat_no between 10 and 15;
  delete from hatlar where zona_id = z1 and hat_no between 10 and 15;

  -- 3) Hatlari olustur (fiskiye_sayisi asagida vana toplamindan hesaplanir)
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 10, 10, '119/11', 0, 480) returning id into h10;
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 11, 11, '119/11', 0, 480) returning id into h11;
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 12, 12, '119/11', 0, 480) returning id into h12;
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 13, 13, '119/11', 0, 480) returning id into h13;
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 14, 14, '119/9-119/11', 0, 480) returning id into h14;
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 15, 15, '119/9-119/11', 0, 480) returning id into h15;

  -- 4) Vana atamalari
  -- Hat-10: 58 alt+ust, 57(24), 55 ust, 56 ust
  update vanalar set hat_id = h10 where boru_hatti = 'kuzeybati-kolu' and (
        (isaretci_no = 58)
     or (isaretci_no = 57 and yon is null)
     or (isaretci_no in (55,56) and yon = 'ust'));

  -- Hat-11: 57(28), 54 alt, 55 alt, 56 alt
  update vanalar set hat_id = h11 where boru_hatti = 'kuzeybati-kolu' and (
        (isaretci_no = 57 and yon = 'kismi')
     or (isaretci_no in (54,55,56) and yon = 'alt'));

  -- Hat-12: 50,51,52,53,54 ust + 51,52,53 alt
  update vanalar set hat_id = h12 where boru_hatti = 'kuzeybati-kolu' and (
        (isaretci_no in (50,51,52,53,54) and yon = 'ust')
     or (isaretci_no in (51,52,53) and yon = 'alt'));

  -- Hat-13: 47,48,49 ust + 43,44,45,46 (tek yonlu)
  update vanalar set hat_id = h13 where boru_hatti = 'kuzeybati-kolu' and (
        (isaretci_no in (47,48,49) and yon = 'ust')
     or (isaretci_no in (43,44,45,46)));

  -- Hat-14: 47,48,49,50 alt + 36,37,38,39 alt
  update vanalar set hat_id = h14 where boru_hatti = 'kuzeybati-kolu'
     and isaretci_no in (36,37,38,39,47,48,49,50) and yon = 'alt';

  -- Hat-15: 37,38,39 ust + 40,41,42 (tek yonlu)
  update vanalar set hat_id = h15 where boru_hatti = 'kuzeybati-kolu' and (
        (isaretci_no in (37,38,39) and yon = 'ust')
     or (isaretci_no in (40,41,42)));

  -- 5) fiskiye_sayisi'ni gercek vana toplamindan yaz
  update hatlar h set fiskiye_sayisi = coalesce((
    select sum(v.fiskiye_sayisi) from vanalar v where v.hat_id = h.id), 0)
  where h.zona_id = z1 and h.hat_no between 10 and 15;
end $$;

-- KONTROL 1: hat basina vana/fiskiye
select h.hat_no, count(v.id) as vana_kaydi, sum(v.fiskiye_sayisi) as fiskiye
from hatlar h left join vanalar v on v.hat_id = h.id
where h.hat_no between 10 and 15
group by 1 order by 1;

-- KONTROL 2: atanmamis kalan kuzeybati vanalari (36 ust beklenir)
select isaretci_no, yon, fiskiye_sayisi
from vanalar where hat_id is null and boru_hatti = 'kuzeybati-kolu'
order by isaretci_no;
