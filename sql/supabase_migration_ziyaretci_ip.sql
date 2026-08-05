-- ============================================================
-- ZIYARETCI LOGU — IP ADRESI KOLONU
-- Supabase Dashboard > SQL Editor'da calistirin.
--
-- Ziyaret kaydina cihazin genel (public) IP adresi eklenir.
-- Eski kayitlar null kalir. IP alinamadiginda da null kalir —
-- ziyaret kaydinin kendisi her halukarda atilir.
--
-- Konum bilgisi TOPLANMAZ (geolocation'a dokunulmaz).
--
-- Bu betik IDEMPOTENT'tir: birden fazla kez calistirilabilir.
-- Hicbir mevcut tablo silinmez, mevcut kolon degistirilmez.
-- ============================================================

alter table ziyaretci_loglari
  add column if not exists ip text;

-- ============================================================
-- KONTROL SORGULARI
-- ============================================================

-- Kolon eklendi mi? (1 satir beklenir, is_nullable = YES)
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'ziyaretci_loglari'
  and column_name = 'ip';

-- Kayit dagilimi
select
  count(*)                                as toplam_ziyaret,
  count(*) filter (where ip is not null)  as ip_kayitli,
  count(*) filter (where ip is null)      as ip_yok_eski_veya_alinamadi
from ziyaretci_loglari;

select 'ziyaretci_loglari.ip hazir' as durum;
