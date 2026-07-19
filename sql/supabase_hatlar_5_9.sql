-- ============================================================
-- HAT TANIMLARI 5-9 (GUNEY KOLU — ALT / 119-7 YONU)
-- (19 Temmuz 2026)
-- Supabase Dashboard > SQL Editor'da calistirin.
-- ============================================================

do $$
declare
  b uuid; z1 uuid;
  h5 uuid; h6 uuid; h7 uuid; h8 uuid; h9 uuid;
begin
  select id into b  from bolgeler where kod = 'kayseri-ana';
  select id into z1 from zonalar where bolge_id = b order by sira_no limit 1;

  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 5, 5, '119/7', 84, 480) returning id into h5;
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 6, 6, '119/7', 92, 480) returning id into h6;
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 7, 7, '119/7', 93, 480) returning id into h7;
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 8, 8, '119/7', 89, 480) returning id into h8;
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 9, 9, '119/7', 83, 480) returning id into h9;

  -- Vana atamalari: guney kolunda ALT kayitlar (cift yonlulerde alt bu hatlara ait)
  update vanalar set hat_id = h5
    where boru_hatti = 'guney-kolu' and isaretci_no in (20,22,23) and (yon = 'alt' or yon is null);
  update vanalar set hat_id = h6
    where boru_hatti = 'guney-kolu' and isaretci_no in (24,25,26) and (yon = 'alt' or yon is null);
  update vanalar set hat_id = h7
    where boru_hatti = 'guney-kolu' and isaretci_no in (27,28,29) and (yon = 'alt' or yon is null);
  update vanalar set hat_id = h8
    where boru_hatti = 'guney-kolu' and isaretci_no in (30,31,32) and (yon = 'alt' or yon is null);
  update vanalar set hat_id = h9
    where boru_hatti = 'guney-kolu' and isaretci_no in (33,34,35) and (yon = 'alt' or yon is null);
end $$;

-- KONTROL: Hat 5-9 vana sayisi 3'er, fiskiyeler 84/92/93/89/83 beklenir
select h.hat_no,
       h.fiskiye_sayisi as beklenen,
       count(v.id) as vana_sayisi,
       coalesce(sum(v.fiskiye_sayisi), 0) as fiskiye_toplami
from hatlar h
left join vanalar v on v.hat_id = h.id
where h.hat_no between 5 and 9
group by 1, 2
order by 1;
