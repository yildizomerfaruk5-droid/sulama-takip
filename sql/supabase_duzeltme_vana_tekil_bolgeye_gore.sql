-- ============================================================
-- DUZELTME: VANA TEKILLIGI BOLGE BAZINA ALINDI (31 Temmuz 2026)
--
-- SORUN:
--   supabase_migration_vanalar.sql su indeksi kurmustu:
--     create unique index vanalar_isaretci_yon_uniq
--       on vanalar (isaretci_no, coalesce(yon, '-'));
--   Bu indekste bolge_id YOK — yani isaretci numaralari TUM SISTEMDE
--   benzersiz olmak zorunda. Kayseri 1..97'yi kullandigi icin ikinci bir
--   bolge "Isaretci 1"i ekleyemiyor.
--
--   Sonuc: kurulum sihirbaziyla yeni bir tarla kurulamiyordu
--   (KURULUM_SIHIRBAZI_SPEC.md Bolum 7, 1. kabul kriteri).
--
-- COZUM:
--   Tekillik (bolge_id, isaretci_no, yon) uclusune tasinir. Her bolge
--   kendi numaralandirmasini bagimsiz kullanir; bolge icinde ayni
--   isaretci+yon yine tekrarlanamaz.
--
-- MEVCUT VERIYE ETKISI: YOK.
--   Kayseri'nin 136 vana kaydi tek bolgede oldugu icin yeni indeks de
--   ayni satirlari benzersiz kabul eder; hicbir kayit silinmez/degismez.
--
-- DIKKAT — ESKI ARSIV DOSYALARI:
--   supabase_migration_vanalar.sql, supabase_migration_vanalar_kuzeybati.sql
--   ve sql/supabase_vanalar_59_78_hatlar_16_20.sql dosyalari
--   "on conflict (isaretci_no, coalesce(yon, '-'))" kullanir. Bu dosyalar
--   ZATEN CALISTIRILMIS arsivlerdir. Yeni bir ortam kurarken once onlar,
--   EN SON bu dosya calistirilmalidir (bkz. sql/README.md sirasi).
--
-- IDEMPOTENT: birden fazla kez calistirilabilir.
-- Supabase Dashboard > SQL Editor'da calistirin.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ON KONTROL: bolge_id'si bos vana var mi?
--    (Yeni indekste NULL'lar birbirinden farkli sayilir; oyle kayit
--     varsa once bolgeye baglanmalidir.)
-- ------------------------------------------------------------
do $$
declare bossayi int;
begin
  select count(*) into bossayi from vanalar where bolge_id is null;
  if bossayi > 0 then
    raise exception 'bolge_id bos % vana kaydi var — once bunlari bir bolgeye baglayin', bossayi;
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. CAKISMA KONTROLU: yeni indeks kurulabilir mi?
--    (Ayni bolgede ayni isaretci+yon iki kez varsa indeks kurulamaz;
--     hangi kayitlarin cakistigini onceden ve anlasilir sekilde soyle.)
-- ------------------------------------------------------------
do $$
declare cakisma text;
begin
  select string_agg(format('bolge=%s isaretci=%s yon=%s (%s kayit)',
                           bolge_id, isaretci_no, coalesce(yon, '-'), adet), ', ')
    into cakisma
  from (
    select bolge_id, isaretci_no, yon, count(*) as adet
    from vanalar
    group by bolge_id, isaretci_no, yon
    having count(*) > 1
  ) c;

  if cakisma is not null then
    raise exception 'Ayni bolgede tekrarlanan vana kaydi var, once temizleyin: %', cakisma;
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. YENI INDEKS (once kur, sonra eskisini birak — arada tekillik
--    korumasiz kalinmasin)
-- ------------------------------------------------------------
create unique index if not exists vanalar_bolge_isaretci_yon_uniq
  on vanalar (bolge_id, isaretci_no, coalesce(yon, '-'));

drop index if exists vanalar_isaretci_yon_uniq;

-- ------------------------------------------------------------
-- 4. KONTROL
-- ------------------------------------------------------------
select indexname, indexdef
from pg_indexes
where tablename = 'vanalar' and indexname like '%isaretci%'
order by indexname;
-- Beklenen: yalnizca vanalar_bolge_isaretci_yon_uniq (bolge_id ile baslayan)

-- Bolge basina vana ozeti — Kayseri sayilari degismemis olmali
select b.kod,
       count(*)                        as vana_kaydi,
       count(distinct v.isaretci_no)   as farkli_isaretci,
       sum(v.fiskiye_sayisi)           as fiskiye
from vanalar v
join bolgeler b on b.id = v.bolge_id
group by b.kod
order by b.kod;
-- Beklenen (yalnizca Kayseri kuruluyken): kayseri-ana -> 136 / 96 / 2400 civari
