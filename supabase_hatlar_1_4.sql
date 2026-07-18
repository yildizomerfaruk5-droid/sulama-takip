-- ============================================================
-- HAT TANIMLARI 1-4 (KUZEYDOGU KOLU) + 1. SU BASLANGICI
-- (18 Temmuz 2026 — sulama sahada 17:00'de baslatildi)
-- Supabase Dashboard > SQL Editor'da calistirin.
-- ============================================================

-- 0. Sayac artik veritabaninda: cihazlar arasi tutarli
alter table sistem_durumu add column if not exists hat_baslama_zamani timestamptz;

do $$
declare
  b uuid; z1 uuid; t1 uuid;
  h1 uuid; h2 uuid; h3 uuid; h4 uuid;
begin
  select id into b from bolgeler where kod = 'kayseri-ana';
  select id into z1 from zonalar where bolge_id = b order by sira_no limit 1;
  if z1 is null then
    raise exception 'Zona bulunamadi — bolge migrationlari calistirilmis olmali';
  end if;

  -- 1. Hatlar (fiskiye toplamlari vana verisinden hesaplandi)
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 1, 1, '119/7-119/6', 94, 480) returning id into h1;
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 2, 2, '119/7-119/6', 95, 480) returning id into h2;
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 3, 3, '119/7-119/6', 94, 480) returning id into h3;
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 4, 4, '119/7-119/6', 89, 480) returning id into h4;

  -- 2. Vana -> hat atamalari (kuzeydogu kolu)
  update vanalar set hat_id = h1
    where boru_hatti = 'kuzeydogu-kolu' and isaretci_no in (13,14,15,16,17,18,19,1);
  update vanalar set hat_id = h2
    where boru_hatti = 'kuzeydogu-kolu' and isaretci_no in (12,11,10);
  update vanalar set hat_id = h3
    where boru_hatti = 'kuzeydogu-kolu' and isaretci_no in (9,8,7);
  update vanalar set hat_id = h4
    where boru_hatti = 'kuzeydogu-kolu' and isaretci_no in (6,5,4,3,2);

  -- 3. 1. Su — sahada bugun 17:00'de baslatildi (TR saati)
  insert into turlar (zona_id, tur_no, baslangic_zamani, durum)
    values (z1, 1, '2026-07-18T17:00:00+03:00', 'devam_ediyor')
    returning id into t1;

  -- 4. Sistem durumu: Hat-1 aktif (17:00'den beri), Hat-2 sirada
  update sistem_durumu set
    sistem_acik = true,
    aktif_hat_id = h1,
    siradaki_hat_id = h2,
    aktif_tur_id = t1,
    aktif_zona_id = z1,
    hat_baslama_zamani = '2026-07-18T17:00:00+03:00',
    guncelleme_zamani = now()
  where bolge_id = b;
end $$;

-- 5. KONTROL: hat basina vana ve fiskiye toplami
-- Beklenen: Hat-1: 8 vana/94 — Hat-2: 3/95 — Hat-3: 3/94 — Hat-4: 5/89
select h.hat_no,
       h.fiskiye_sayisi as beklenen,
       count(v.id) as vana_sayisi,
       coalesce(sum(v.fiskiye_sayisi), 0) as fiskiye_toplami
from hatlar h
left join vanalar v on v.hat_id = h.id
group by 1, 2
order by 1;
