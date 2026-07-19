-- ============================================================
-- KESIN DUZELTME (19 Temmuz 2026) — onceki denemelerden bagimsiz,
-- hangi durumda olursa olsun sistemi gercek saha akisina esitler:
--   Hat-1 : 18 Tem 17:00 -> 19 Tem 02:00 (540 dk)
--   Hat-2 : 19 Tem 02:00 -> 19 Tem 10:00 (480 dk)
--   Hat-3 : 10:00'dan beri CALISIYOR, Hat-4 sirada
-- Fotografli/gubreli veri girisleri KORUNUR (silinmez).
-- Supabase Dashboard > SQL Editor'da calistirin.
-- ============================================================

do $$
declare
  b uuid; z1 uuid; taktif uuid;
  h1 uuid; h2 uuid; h3 uuid; h4 uuid;
begin
  select id into b  from bolgeler where kod = 'kayseri-ana';
  select id into z1 from zonalar where bolge_id = b order by sira_no limit 1;
  select aktif_tur_id into taktif from sistem_durumu where bolge_id = b;
  select id into h1 from hatlar where zona_id = z1 and hat_no = 1;
  select id into h2 from hatlar where zona_id = z1 and hat_no = 2;
  select id into h3 from hatlar where zona_id = z1 and hat_no = 3;
  select id into h4 from hatlar where zona_id = z1 and hat_no = 4;

  if taktif is null then
    raise exception 'Aktif tur bulunamadi';
  end if;

  -- 1) Bu turun OTOMATIK kayitlarini temizle (hatali sureli olanlar dahil)
  --    islem_turu dolu olanlar (fotograf/gubre girisleri) korunur
  delete from sulama_kayitlari
  where tur_id = taktif and islem_turu is null;

  -- 2) Gercek kayitlari yaz
  insert into sulama_kayitlari (hat_id, tur_id, baslangic_zamani, bitis_zamani, sure_dakika, durum)
  values
    (h1, taktif, '2026-07-18T17:00:00+03:00', '2026-07-19T02:00:00+03:00', 540, 'tamamlandi'),
    (h2, taktif, '2026-07-19T02:00:00+03:00', '2026-07-19T10:00:00+03:00', 480, 'tamamlandi');

  -- 3) Sistem: Hat-3 aktif (10:00'dan beri), Hat-4 sirada
  update sistem_durumu set
    sistem_acik = true,
    aktif_hat_id = h3,
    siradaki_hat_id = h4,
    aktif_zona_id = z1,
    hat_baslama_zamani = '2026-07-19T10:00:00+03:00',
    guncelleme_zamani = now()
  where bolge_id = b;

  insert into olay_loglari (bolge_id, olay, detay)
  values (b, 'hat_gecisi',
    'Kesin düzeltme: Hat-1 (17:00-02:00) ve Hat-2 (02:00-10:00) işlendi; Hat-3 10:00''dan beri aktif');
end $$;

-- KONTROL (tek sonuc): aktif hat 3, baslama 10:00, kayitlar "1:540, 2:480" gorunmeli
select
  (select h.hat_no from hatlar h join sistem_durumu s on s.aktif_hat_id = h.id) as aktif_hat,
  (select hat_baslama_zamani at time zone 'Europe/Istanbul' from sistem_durumu limit 1) as hat_baslama,
  (select string_agg(h.hat_no::text || ':' || k.sure_dakika::text, ', ' order by k.baslangic_zamani)
     from sulama_kayitlari k
     join hatlar h on h.id = k.hat_id
     where k.islem_turu is null) as tamamlanan_kayitlar;
