-- ============================================================
-- YENI VANALAR (59-78) + HAT 16-20 — 25 Temmuz 2026
-- Kaynak: export_2026_07_24-15_15_20.kml + "hatlar ve sulamalar..txt"
--
-- NOTLAR:
--  * 71-78'deki "50lik" ifadesi BORU CAPIDIR; fiskiye sayisi sonraki rakamdir.
--  * Yeni vanalarin ekim yonu/parseli SAHADAN TEYIT BEKLIYOR — simdilik
--    guney kolu varsayimi (240 derece / 119/9) girildi. Teyit gelince
--    tek UPDATE ile duzeltilecek; vanalar haritada hemen gorunur.
--  * Idempotent: birden fazla kez calistirilabilir.
-- Supabase Dashboard > SQL Editor'da calistirin.
-- ============================================================

do $$
declare
  b uuid; z1 uuid; taktif uuid;
  h16 uuid; h17 uuid; h18 uuid; h19 uuid; h20 uuid;
begin
  select id into b  from bolgeler where kod = 'kayseri-ana';
  select id into z1 from zonalar where bolge_id = b order by sira_no limit 1;

  -- 1) YENI VANALAR (59-78) — toplam 178 fiskiye
  insert into vanalar (bolge_id, isaretci_no, lat, lng, fiskiye_sayisi,
                       yon, parsel, ekim_yonu_derece, boru_hatti, notlar)
  values
    (b, 59, 38.62826340188824,  36.245266422629356, 13, 'ust', '119/9', 60, 'guney-kolu-devam', null),
    (b, 60, 38.628170100074726, 36.245320600423454, 13, 'ust', '119/9', 60, 'guney-kolu-devam', null),
    (b, 61, 38.62807029999935,  36.24538030000058,  12, 'ust', '119/9', 60, 'guney-kolu-devam', null),
    (b, 62, 38.62795800025241,  36.245424672961235, 12, 'ust', '119/9', 60, 'guney-kolu-devam', null),
    (b, 63, 38.62786076504213,  36.24543711361308,  12, 'ust', '119/9', 60, 'guney-kolu-devam', null),
    (b, 64, 38.6277514,         36.2454797,         11, 'ust', '119/9', 60, 'guney-kolu-devam', null),
    (b, 65, 38.62763739981779,  36.245510998663846, 10, 'ust', '119/9', 60, 'guney-kolu-devam', null),
    (b, 66, 38.6275481,         36.2455814,         10, 'ust', '119/9', 60, 'guney-kolu-devam', null),
    (b, 67, 38.62744439999038,  36.24567789997247,  10, 'ust', '119/9', 60, 'guney-kolu-devam', null),
    (b, 68, 38.6273666,         36.2457807,         10, 'ust', '119/9', 60, 'guney-kolu-devam', null),
    (b, 69, 38.62727380984992,  36.245837167279625,  8, 'ust', '119/9', 60, 'guney-kolu-devam', null),
    (b, 70, 38.627181394178265, 36.24593496322632,  10, 'ust', '119/9', 60, 'guney-kolu-devam', null),
    (b, 71, 38.62710307829275,  36.24603487551212,   5, 'ust', '119/9', 60, 'guney-kolu-devam', '50lik boru'),
    (b, 72, 38.6269995,         36.2460738,          6, 'ust', '119/9', 60, 'guney-kolu-devam', '50lik boru'),
    (b, 73, 38.62690008521479,  36.2461069598794,    6, 'ust', '119/9', 60, 'guney-kolu-devam', '50lik boru'),
    (b, 74, 38.626798493276155, 36.24609296382333,   6, 'ust', '119/9', 60, 'guney-kolu-devam', '50lik boru'),
    (b, 75, 38.62670060000846,  36.24600850000329,   6, 'ust', '119/9', 60, 'guney-kolu-devam', '50lik boru'),
    (b, 76, 38.6266285999314,   36.246018600137184,  5, 'ust', '119/9', 60, 'guney-kolu-devam', '50lik boru'),
    (b, 77, 38.6264199,         36.2460653,          8, 'ust', '119/9', 60, 'guney-kolu-devam', '50lik boru'),
    (b, 78, 38.626401112690395, 36.24606505036354,   5, 'ust', '119/9', 60, 'guney-kolu-devam', '50lik boru')
  on conflict (isaretci_no, coalesce(yon, '-')) do nothing;

  -- 1b) ZONA 2 VANALARI (79-97) — 114 adasi, toplam 387 fiskiye
  --     Ekim yonu SAHADAN TEYIT BEKLIYOR (simdilik null; teyit gelince
  --     tek update ile girilir — fiskiyeler o zaman haritaya cizilir).
  insert into vanalar (bolge_id, isaretci_no, lat, lng, fiskiye_sayisi,
                       yon, parsel, ekim_yonu_derece, boru_hatti, notlar)
  values
    (b, 79, 38.6277088,          36.2503505,          10, 'alt', '114/21', null, 'dogu-blok', null),
    (b, 79, 38.6277088,          36.2503505,           4, 'ust', '114/21', null, 'dogu-blok', null),
    (b, 80, 38.627720435644804,  36.25049538910389,   12, 'alt', '114/21', null, 'dogu-blok', null),
    (b, 80, 38.627720435644804,  36.25049538910389,    4, 'ust', '114/21', null, 'dogu-blok', null),
    (b, 81, 38.62771490000005,   36.25064560000002,   12, 'alt', '114/21', null, 'dogu-blok', null),
    (b, 81, 38.62771490000005,   36.25064560000002,    5, 'ust', '114/21', null, 'dogu-blok', null),
    (b, 82, 38.627721127,        36.250783589875,      9, 'alt', '114/21', null, 'dogu-blok', null),
    (b, 82, 38.627721127,        36.250783589875,      4, 'ust', '114/21', null, 'dogu-blok', null),
    (b, 83, 38.627716244861865,  36.25090442597866,    7, 'alt', '114/21', null, 'dogu-blok', 'Sahada "6+1"'),
    (b, 83, 38.627716244861865,  36.25090442597866,    8, 'ust', '114/21', null, 'dogu-blok', 'Sahada "5+3"'),
    (b, 84, 38.627723316807945,  36.25111900269985,   27, 'alt', '114/20', null, 'dogu-blok', 'Sahada "20+7"'),
    (b, 84, 38.627723316807945,  36.25111900269985,    1, 'ust', '114/20', null, 'dogu-blok', null),
    (b, 85, 38.627651287694896,  36.251377165317535,  19, 'alt', '114/20', null, 'dogu-blok', null),
    (b, 85, 38.627651287694896,  36.251377165317535,   4, 'ust', '114/20', null, 'dogu-blok', null),
    (b, 86, 38.62763780000007,   36.25152050000009,   19, 'alt', '114/20', null, 'dogu-blok', null),
    (b, 86, 38.62763780000007,   36.25152050000009,    8, 'ust', '114/20', null, 'dogu-blok', null),
    (b, 87, 38.62762039975338,   36.25167230041502,   19, 'alt', '114/20', null, 'dogu-blok', null),
    (b, 87, 38.62762039975338,   36.25167230041502,    8, 'ust', '114/20', null, 'dogu-blok', null),
    (b, 88, 38.62760340230172,   36.25179400076724,   19, 'alt', '114/20', null, 'dogu-blok', null),
    (b, 88, 38.62760340230172,   36.25179400076724,    7, 'ust', '114/20', null, 'dogu-blok', null),
    (b, 89, 38.627567707458496,  36.251949429833985,  19, 'alt', '114/20', null, 'dogu-blok', null),
    (b, 89, 38.627567707458496,  36.251949429833985,   6, 'ust', '114/20', null, 'dogu-blok', null),
    (b, 90, 38.627529400000704,  36.25209330000007,   19, 'alt', '114/20', null, 'dogu-blok', null),
    (b, 90, 38.627529400000704,  36.25209330000007,    5, 'ust', '114/20', null, 'dogu-blok', null),
    (b, 91, 38.6275257001362,    36.2521698000908,    18, 'alt', '114/20', null, 'dogu-blok', null),
    (b, 91, 38.6275257001362,    36.2521698000908,     4, 'ust', '114/20', null, 'dogu-blok', null),
    (b, 92, 38.627497276112315,  36.252294816076756,  17, 'alt', '114/20', null, 'dogu-blok', null),
    (b, 92, 38.627497276112315,  36.252294816076756,   3, 'ust', '114/20', null, 'dogu-blok', null),
    (b, 93, 38.6274774,          36.2524305,          17, 'alt', '114/20', null, 'dogu-blok', null),
    (b, 93, 38.6274774,          36.2524305,           2, 'ust', '114/20', null, 'dogu-blok', null),
    (b, 94, 38.627460344714265,  36.252555660903454,  17, null,  '114/20', null, 'dogu-blok', null),
    (b, 95, 38.62741280070241,   36.25267669994147,   16, null,  '114/20', null, 'dogu-blok', null),
    (b, 96, 38.62732597712675,   36.252768225967884,  15, null,  '114/20', null, 'dogu-blok', null),
    (b, 97, 38.62722779998678,   36.252948099951155,  23, null,  '114/20', null, 'dogu-blok', 'Sahada "13+10"')
  on conflict (isaretci_no, coalesce(yon, '-')) do nothing;

  -- 2) Eski Hat-16..20 varsa temizle (yeniden kurulum icin)
  update vanalar v set hat_id = null from hatlar h
   where v.hat_id = h.id and h.zona_id = z1 and h.hat_no between 16 and 20;
  delete from hatlar where zona_id = z1 and hat_no between 16 and 20;

  -- 3) HATLAR
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 16, 16, '119/9', 0, 480) returning id into h16;
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 17, 17, '119/9', 0, 480) returning id into h17;
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 18, 18, '119/9', 0, 480) returning id into h18;
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 19, 19, '119/9', 0, 480) returning id into h19;
  insert into hatlar (zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk)
    values (z1, 20, 20, '119/9', 0, 480) returning id into h20;

  -- 4) VANA ATAMALARI
  -- Hat-16: 36 ust + 26,27,28 ust
  update vanalar set hat_id = h16
    where (isaretci_no = 36 and yon = 'ust')
       or (isaretci_no in (26,27,28) and yon = 'ust');

  -- Hat-17: 29,30,31,32 ust
  update vanalar set hat_id = h17
    where isaretci_no in (29,30,31,32) and yon = 'ust';

  -- Hat-18: 33,34 ust + 59,60
  update vanalar set hat_id = h18
    where (isaretci_no in (33,34) and yon = 'ust')
       or (isaretci_no in (59,60));

  -- Hat-19: 61-66
  update vanalar set hat_id = h19 where isaretci_no between 61 and 66;

  -- Hat-20: 67-78
  update vanalar set hat_id = h20 where isaretci_no between 67 and 78;

  -- 5) Fiskiye toplamlarini gercek vana verisinden yaz
  update hatlar h set fiskiye_sayisi = coalesce((
    select sum(v.fiskiye_sayisi) from vanalar v where v.hat_id = h.id), 0)
  where h.zona_id = z1 and h.hat_no between 16 and 20;

  -- 6) SULAMA KAYITLARI — kesintisiz 8'er saat (Hat-15: 23.07 14:00-22:00'den sonra)
  --    Hat-16: 23.07 22:00 -> 24.07 06:00
  --    Hat-17: 24.07 06:00 -> 14:00
  --    Hat-18: 24.07 14:00 -> 22:00
  --    Hat-19: 24.07 22:00 -> 25.07 06:00
  --    Hat-20: 25.07 06:00 -> 14:00
  select aktif_tur_id into taktif from sistem_durumu where bolge_id = b;
  if taktif is null then
    select id into taktif from turlar where zona_id = z1
     order by baslangic_zamani desc limit 1;
    -- Sistem Hat-16 tanimli olmadigi icin kapanmisti: turu yeniden ac
    update turlar set durum = 'devam_ediyor', bitis_zamani = null where id = taktif;
  end if;

    delete from sulama_kayitlari
     where tur_id = taktif and sure_dakika is not null
       and hat_id in (h16, h17, h18, h19, h20);

    insert into sulama_kayitlari (hat_id, tur_id, baslangic_zamani, bitis_zamani, sure_dakika, durum)
    values
      (h16, taktif, '2026-07-23T22:00:00+03:00', '2026-07-24T06:00:00+03:00', 480, 'tamamlandi'),
      (h17, taktif, '2026-07-24T06:00:00+03:00', '2026-07-24T14:00:00+03:00', 480, 'tamamlandi'),
      (h18, taktif, '2026-07-24T14:00:00+03:00', '2026-07-24T22:00:00+03:00', 480, 'tamamlandi'),
      (h19, taktif, '2026-07-24T22:00:00+03:00', '2026-07-25T06:00:00+03:00', 480, 'tamamlandi'),
      (h20, taktif, '2026-07-25T06:00:00+03:00', '2026-07-25T14:00:00+03:00', 480, 'tamamlandi');

    -- Sistem durumu: Zona 1 tamamlandi (25.07 14:00). Zona 2 hatlari
    -- tanimlanana kadar aktif hat yok — turu ACIK birakiyoruz.
    update sistem_durumu set
      sistem_acik = true,
      aktif_hat_id = null,
      siradaki_hat_id = null,
      aktif_tur_id = taktif,
      aktif_zona_id = z1,
      hat_baslama_zamani = null,
      guncelleme_zamani = now()
    where bolge_id = b;

    insert into olay_loglari (bolge_id, olay, detay)
    values (b, 'hat_gecisi',
      'Hat-16..20 kayitlari islendi (23.07 22:00 - 25.07 14:00, kesintisiz 8''er saat). Zona 1 tamamlandi; Zona 2 hat tanimlari bekleniyor.');
end $$;

-- KONTROL 1: hat basina vana/fiskiye — beklenen: 16:80, 17:81, 18:63, 19:67, 20:85
select h.hat_no, count(v.id) as vana, sum(v.fiskiye_sayisi) as fiskiye
from hatlar h left join vanalar v on v.hat_id = h.id
where h.hat_no between 16 and 20 group by 1 order by 1;

-- KONTROL 2: hicbir hatta atanmamis kalan vanalar
select isaretci_no, yon, fiskiye_sayisi, boru_hatti
from vanalar where hat_id is null order by isaretci_no;
