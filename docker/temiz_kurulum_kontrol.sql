-- ============================================================
-- TEMIZ KURULUM DOGRULAMASI
--
-- kur.sh bunu kurulumun SONUNDA calistirir ve ciktisini gosterir.
-- Amac: yeni isletmenin veritabaninda BASKA bir isletmeye ait
-- (ozellikle Kayseri referans kurulumundan gelen) hicbir isim veya
-- veri kalmadigini kanitlamak.
--
-- BEKLENEN: "temiz_mi" sutununda her satir "TEMIZ".
-- Herhangi biri "KIRLI" ise kurulum yanlis dosyalari uygulamistir.
-- ============================================================

\pset pager off

-- ── 1. Veri tablolari bos mu? ──
-- Sema tablolari dolu olmali (yapisal), veri tablolari BOS olmali.
select
  tablo,
  satir,
  case when satir = 0 then 'TEMIZ' else 'KIRLI' end as temiz_mi
from (
  select 'bolgeler'          as tablo, count(*) as satir from bolgeler
  union all select 'zonalar',           count(*) from zonalar
  union all select 'hatlar',            count(*) from hatlar
  union all select 'turlar',            count(*) from turlar
  union all select 'vanalar',           count(*) from vanalar
  union all select 'parseller',         count(*) from parseller
  union all select 'boru_hatlari',      count(*) from boru_hatlari
  union all select 'saha_noktalari',    count(*) from saha_noktalari
  union all select 'vana_parselleri',   count(*) from vana_parselleri
  union all select 'sulama_kayitlari',  count(*) from sulama_kayitlari
  union all select 'gubreler',          count(*) from gubreler
  union all select 'gubre_uygulamalari',count(*) from gubre_uygulamalari
  union all select 'izleyiciler',       count(*) from izleyiciler
  union all select 'ziyaretci_loglari', count(*) from ziyaretci_loglari
  union all select 'olay_loglari',      count(*) from olay_loglari
) t
order by temiz_mi desc, tablo;

-- ── 2. Kayseri'ye ozgu isimler hicbir yerde geciyor mu? ──
-- Referans kurulumun ayirt edici degerleri tek tek aranir.
select
  aranan,
  bulundu,
  case when bulundu = 0 then 'TEMIZ' else 'KIRLI' end as temiz_mi
from (
  select 'bolge kodu: kayseri-ana' as aranan,
         (select count(*) from bolgeler where kod ilike '%kayseri%'
                                           or ad  ilike '%kayseri%'
                                           or il  ilike '%kayseri%') as bulundu
  union all
  select 'zona adi: "Ana Blok" / "Zona 1 - ..."',
         (select count(*) from zonalar where ad ilike '%ana blok%'
                                          or aciklama ilike '%119%')
  union all
  select 'parsel metni: 119/x, 120/x (Kayseri ada no)',
         (select count(*) from hatlar where parsel_bilgisi ~ '\m(119|120)/')
  union all
  select 'vana parsel metni: 119/x, 120/x',
         (select count(*) from vanalar where parsel ~ '\m(119|120)/')
  union all
  select 'vana boru hatti: kuzeydogu-kolu / guney-kolu',
         (select count(*) from vanalar where boru_hatti in ('kuzeydogu-kolu','guney-kolu'))
  union all
  select 'parsel adi: 119/x, 120/x',
         (select count(*) from parseller where ad ~ '\m(119|120)/')
  union all
  select 'Kayseri gubre listesi (Karboksilik Asit vb.)',
         (select count(*) from gubreler
           where ad in ('Karboksilik Asit','Hayvansal Aminoasit','UAN 32',
                        'Sıvı Kükürt','33 Nitrat','Amonyum Tiyosülfat'))
  union all
  select 'Kayseri koordinat kusagi (lat 38.6x / lng 36.2x)',
         (select count(*) from vanalar
           where lat between 38.5 and 38.8 and lng between 36.1 and 36.4)
) t
order by temiz_mi desc, aranan;

-- ── 3. Yapinin kendisi yerinde mi? (bos olmasi gereken tablolar var mi) ──
select
  'tablo sayisi' as olcut,
  count(*)::text as deger,
  case when count(*) >= 16 then 'TAMAM' else 'EKSIK' end as durum
from information_schema.tables
where table_schema = 'public'
union all
select 'pg_cron isi',
       coalesce(string_agg(jobname, ', '), '(yok)'),
       case when count(*) = 1 then 'TAMAM' else 'EKSIK' end
from cron.job where jobname = 'hat-gecis-kontrol'
union all
select 'hat_gecis_kontrol fonksiyonu',
       count(*)::text,
       case when count(*) = 1 then 'TAMAM' else 'EKSIK' end
from pg_proc where proname = 'hat_gecis_kontrol'
union all
select 'RLS acik tablo sayisi',
       count(*)::text,
       case when count(*) >= 14 then 'TAMAM' else 'EKSIK' end
from pg_tables where schemaname = 'public' and rowsecurity = true
union all
select 'yonetici profili',
       count(*)::text,
       case when count(*) >= 1 then 'TAMAM' else 'EKSIK' end
from profiller where rol = 'yonetici';
