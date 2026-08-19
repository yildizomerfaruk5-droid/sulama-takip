-- ============================================================
-- MANUEL HAT GECISI — pg_cron UCTAN UCA TESTI
--
-- SORU: Manuel olarak SIRA DISI bir hatta atlandiktan sonra,
--       o hat bitince otomatik akis ORIJINAL sira_no duzeninden
--       devam ediyor mu?
--
-- CALISTIRMA (Docker):
--   docker run -d --name gecis_test -e POSTGRES_PASSWORD=test \
--     -e POSTGRES_HOST_AUTH_METHOD=trust supabase/postgres:15.8.1.060
--   # hazir olunca:
--   docker exec -i gecis_test psql -U postgres < sql/supabase_migration_00_cekirdek_sema.sql
--   docker exec -i gecis_test psql -U postgres < sql/supabase_migration_hat_manuel_gecis.sql
--   docker exec -i gecis_test psql -U postgres < sql/test/manuel_gecis_testi.sql
--
-- BEKLENEN: son bolumdeki her satirda sonuc = GECTI
-- ============================================================
\pset pager off
\set ON_ERROR_STOP on

-- ── Temiz senaryo: 5 hatli tek zona, her hat 1 dk ──
delete from sulama_kayitlari; delete from sistem_durumu;
delete from turlar; delete from hatlar; delete from zonalar;

insert into zonalar (id, ad, sira_no)
values ('11111111-1111-1111-1111-111111111111', 'Test Zona', 1);

insert into hatlar (id, zona_id, hat_no, sira_no, varsayilan_sure_dk, aktif)
select ('aaaaaaaa-0000-0000-0000-00000000000' || n)::uuid,
       '11111111-1111-1111-1111-111111111111', n, n, 1, true
from generate_series(1, 5) n;

insert into turlar (id, zona_id, tur_no, baslangic_zamani, durum)
values ('bbbbbbbb-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 1, now(), 'devam');

-- ── MANUEL SAPMA: Hat-1 calisirken Hat-4'e atlandi ──
-- Arayuzun yaptigi ile AYNI: siradaki, HEDEFIN sira_no'suna gore.
-- Ayrica tek seferlik sure 2 dk veriliyor (varsayilan 1 dk).
insert into sistem_durumu
  (id, aktif_hat_id, siradaki_hat_id, aktif_tur_id, aktif_zona_id,
   sistem_acik, hat_baslama_zamani, aktif_hat_sure_dk)
values (1,
  'aaaaaaaa-0000-0000-0000-000000000004',   -- manuel secilen hat
  'aaaaaaaa-0000-0000-0000-000000000005',   -- 4'ten sonraki = 5
  'bbbbbbbb-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  true,
  now() - interval '10 minutes',            -- suresi coktan doldu
  2);                                       -- TEK SEFERLIK 2 dk

-- Hat-1 "yarim kaldi" olarak kaydedilmisti (sure_dakika BOS)
insert into sulama_kayitlari (hat_id, tur_id, baslangic_zamani, bitis_zamani, sure_dakika, durum)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000000001',
        now() - interval '20 minutes', now() - interval '10 minutes', null, 'iptal');

\echo ''
\echo '=== BASLANGIC: Hat-4 aktif (manuel sapma), siradaki Hat-5 ==='
select h.hat_no as aktif, s.aktif_hat_sure_dk as tek_seferlik_sure,
       (select hat_no from hatlar where id = s.siradaki_hat_id) as siradaki
from sistem_durumu s join hatlar h on h.id = s.aktif_hat_id;

-- ── pg_cron'un yaptigini elle tetikle ──
select public.hat_gecis_kontrol();

\echo ''
\echo '=== GECISTEN SONRA ==='
select h.hat_no as aktif,
       (select hat_no from hatlar where id = s.siradaki_hat_id) as siradaki,
       s.aktif_hat_sure_dk as tek_seferlik_sure
from sistem_durumu s join hatlar h on h.id = s.aktif_hat_id;

\echo ''
\echo '=== SONUCLAR ==='
select 'Hat-4 tamamlandi kaydi acildi' as kontrol,
       case when exists (
         select 1 from sulama_kayitlari
         where hat_id = 'aaaaaaaa-0000-0000-0000-000000000004'
           and sure_dakika is not null) then 'GECTI' else 'KALDI' end as sonuc
union all
select 'Aktif hat artik Hat-5 (orijinal sira)',
       case when (select hat_no from hatlar h join sistem_durumu s on s.aktif_hat_id = h.id) = 5
            then 'GECTI' else 'KALDI' end
union all
select 'Tek seferlik sure TEMIZLENDI (Hat-5 kendi varsayilanina dondu)',
       case when (select aktif_hat_sure_dk from sistem_durumu) is null
            then 'GECTI' else 'KALDI' end
union all
select 'Hat-1 yarim kaydi sayaca GIRMEDI',
       case when (select count(*) from sulama_kayitlari
                  where hat_id = 'aaaaaaaa-0000-0000-0000-000000000001'
                    and sure_dakika is not null) = 0
            then 'GECTI' else 'KALDI' end
union all
select 'sira_no degerleri DEGISMEDI',
       case when (select string_agg(sira_no::text, ',' order by sira_no) from hatlar) = '1,2,3,4,5'
            then 'GECTI' else 'KALDI' end
union all
-- Hat-2 ve Hat-3 atlanmis durumda; otomatik akis Hat-5'ten devam eder.
-- Bu BEKLENEN davranistir: manuel sapma sirayi degistirmez, yalnizca
-- nereden devam edildigini degistirir.
select 'Hat-2/Hat-3 tamamlanmis SAYILMADI (atlandilar)',
       case when (select count(*) from sulama_kayitlari
                  where hat_id in ('aaaaaaaa-0000-0000-0000-000000000002',
                                   'aaaaaaaa-0000-0000-0000-000000000003')
                    and sure_dakika is not null) = 0
            then 'GECTI' else 'KALDI' end;

\echo ''
\echo '=== IKINCI GECIS: Hat-5 de bitince tur kapanmali ==='
update sistem_durumu set hat_baslama_zamani = now() - interval '10 minutes';
select public.hat_gecis_kontrol();

select 'Zona sonunda sistem kapandi' as kontrol,
       case when (select sistem_acik from sistem_durumu) = false
            then 'GECTI' else 'KALDI' end as sonuc
union all
select 'Tur tamamlandi olarak isaretlendi',
       case when (select durum from turlar limit 1) = 'tamamlandi'
            then 'GECTI' else 'KALDI' end;

\echo ''
\echo '=== HAT BASINA TAMAMLAMA SAYISI (arayuzdeki "kacinci su") ==='
select h.hat_no,
       count(k.id) filter (where k.sure_dakika is not null) as kez
from hatlar h left join sulama_kayitlari k on k.hat_id = h.id
group by h.hat_no order by h.hat_no;
