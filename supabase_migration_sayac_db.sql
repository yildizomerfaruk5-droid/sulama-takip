-- ============================================================
-- SAYACI VERITABANINA TASIMA (Mobil uygulama on kosulu)
-- Supabase Dashboard > SQL Editor'da calistirin.
-- Yeni kod deploy edilmeden ONCE calistirilmalidir.
--
-- NEDEN: Aktif hattin baslama zamani su ana kadar istemcide
-- (localStorage) tutuluyordu. Bu, tek cihazda calisirken sorun
-- degildi; ancak mobilde ayni sulamayi birden fazla cihaz izler:
--   - Isci telefonunda baslatilan hattin sayaci
--     yonetici telefonunda "--:--" gorunur.
--   - Tarayici verisi silinince sayac sifirlanir.
--   - Otomatik hat gecisi (sure dolunca) yalnizca hattı
--     baslatan cihaz acikken calisir.
-- Baslama zamani artik bolge basina tek dogru kaynakta durur.
-- ============================================================

-- 1. AKTIF HAT BASLANGIC KOLONU
alter table sistem_durumu
  add column if not exists aktif_hat_baslangic timestamptz;

comment on column sistem_durumu.aktif_hat_baslangic is
  'Aktif hattin sulamaya basladigi an. Sayac ve otomatik gecis bu degerden hesaplanir. Hat degisince (baslat/atla/zona gecisi) now() yazilir, sistem kapaninca NULL olur.';

-- 2. GERIYE DONUK DOLDURMA
-- Su an acik olan bolgelerde kolon bos kalirsa sayac calismaz.
-- Bilinen en iyi tahmin: son durum guncellemesi (hat gecisinde yazilir).
update sistem_durumu
set aktif_hat_baslangic = coalesce(guncelleme_zamani, now())
where sistem_acik = true
  and aktif_hat_id is not null
  and aktif_hat_baslangic is null;

-- Kontrol: acik bolgelerde baslangic dolu olmali
select
  b.ad                        as bolge,
  sd.sistem_acik,
  sd.aktif_hat_baslangic,
  round(extract(epoch from (now() - sd.aktif_hat_baslangic)) / 60) as gecen_dakika
from sistem_durumu sd
join bolgeler b on b.id = sd.bolge_id
order by b.sira_no;
