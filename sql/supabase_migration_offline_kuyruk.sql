-- ============================================================
-- OFFLINE VERI GIRISI KUYRUGU — IDEMPOTENCY ANAHTARI (2 Agustos 2026)
--
-- AMAC: Saha telefonu cevrimdisiyken girilen foto/not/gubre kayitlari
-- cihazda (IndexedDB) kuyruklanir, sinyal gelince otomatik gonderilir.
-- Gonderim sirasinda uygulama kapanip acilirsa ayni kayit iki kez
-- yazilmasin diye her kuyruk ogesi istemcide uretilen bir UUID tasir.
--
-- ETKI: Yalnizca YENI ve NULL kolonu ekler. Mevcut
-- satirlar degismez, hicbir kolon/kisit kaldirilmaz.
--
-- KAPSAM NOTU: Bu kuyruk SADECE "veri girisi" satirlari icindir —
-- yani sure_dakika BOS olan sulama_kayitlari kayitlari. Gercek hat
-- tamamlamalari (sure_dakika DOLU) asla kuyruklanmaz; onlar sunucudaki
-- hat_gecis_kontrol()/pg_cron ile senkron olmak zorundadir.
--
-- IDEMPOTENT: birden fazla kez calistirilabilir.
-- Supabase Dashboard > SQL Editor'da calistirin.
-- ============================================================

alter table sulama_kayitlari add column if not exists istemci_id uuid;

comment on column sulama_kayitlari.istemci_id is
  'Cevrimdisi kuyruktan gelen kayitlarin istemci tarafi kimligi; '
  'mukerrer gonderimi engeller. Online girilen kayitlarda NULL kalir.';

-- Kismi tekil indeks: NULL'lar cakismaz (online kayitlar etkilenmez),
-- ayni istemci_id ikinci kez yazilamaz.
create unique index if not exists sulama_kayitlari_istemci_id_uniq
  on sulama_kayitlari (istemci_id)
  where istemci_id is not null;

-- ------------------------------------------------------------
-- KONTROL
-- ------------------------------------------------------------
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'sulama_kayitlari'
  and column_name = 'istemci_id';
-- Beklenen: 1 satir, uuid, YES

select indexname, indexdef
from pg_indexes
where tablename = 'sulama_kayitlari' and indexname like '%istemci%';
-- Beklenen: sulama_kayitlari_istemci_id_uniq (WHERE istemci_id IS NOT NULL)

-- Mevcut kayitlar dokunulmamis olmali (hepsi NULL)
select count(*) as toplam_kayit,
       count(istemci_id) as istemci_id_dolu
from sulama_kayitlari;
-- Beklenen: istemci_id_dolu = 0 (ilk calistirmada)
