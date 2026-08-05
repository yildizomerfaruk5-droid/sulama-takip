# Veritabanı SQL Dosyaları

Supabase SQL Editor'da çalıştırılmış migration ve düzeltmelerin arşivi.
**Hepsi zaten çalıştırıldı** — yeni bir kurulumda sırayla çalıştırılır.

> ## ⚠️ Sıfırdan kurulum yapıyorsanız
>
> **Aşağıdaki liste tek başına yetmez.** `zonalar`, `hatlar`, `turlar`,
> `sulama_kayitlari`, `sistem_durumu` ve `giris_gecmisi` tabloları projenin
> başında Supabase panelinden elle oluşturulmuştu ve hiçbir migration'da
> tanımları yoktu. Temiz bir veritabanında bu liste **ilk dosyada** patlar
> (`relation "zonalar" does not exist`).
>
> Önce şunu çalıştırın: **`supabase_migration_00_cekirdek_sema.sql`**
>
> Ayrıca aşağıdaki dosyaların bir kısmı şema ile Kayseri **verisini** bir
> arada taşır. Yeni bir işletme kuruyorsanız bunların `_sema` eşlerini
> kullanın ve sıralamayı `docker/migrasyon_sirasi.txt` üzerinden izleyin.
> Ayrıntılı tablo: **`docs/YEREL_KURULUM.md` > "Şema/veri ayrımı"**

## Kurulum sırası (mevcut bulut ortamının tarihçesi)
0. `supabase_migration_00_cekirdek_sema.sql` — çekirdek tablolar (sonradan yazıldı)
1. `supabase_migration_bolgeler.sql`   — çok bölgeli yapı + roller
2. `supabase_migration_vanalar.sql`    — vana envanteri (işaretçi 1-35)
3. `supabase_guncelleme_ekim_yonu.sql` — ekim doğrultuları (326/60)
4. `supabase_migration_vanalar_kuzeybati.sql` — işaretçi 36-58
5. `supabase_guncelleme_kuzeybati.sql` — kuzeybatı yön/parsel teyitleri
6. `supabase_migration_gubreler.sql`   — gübre modülü
7. `supabase_migration_loglar.sql`     — olay logları
8. `supabase_migration_ziyaretci.sql`  — ziyaretçi kayıtları
9. `supabase_migration_rls_guvenlik.sql` — RLS güvenlik politikaları
10. `supabase_storage_silme.sql`       — fotoğraf silme yetkisi
11. `supabase_hatlar_1_4.sql`          — hat tanımları 1-4

## Kurulum sihirbazı — Aşama 1 (saha verisinin veritabanına taşınması)
Sıra önemli; ikisi de idempotent (tekrar çalıştırılabilir).
Bkz. `KURULUM_SIHIRBAZI_SPEC.md` Bölüm 3 ve 6.

12. `supabase_migration_kurulum_tablolari.sql` — parseller, boru_hatlari,
    saha_noktalari, vana_parselleri tabloları + RLS; vanalar'a `parsel_id` /
    `cizim_kurali`, bolgeler'e fıskiye ayarları kolonları
13. `supabase_seed_kayseri_kurulum.sql`        — `src/harita.js` içindeki sabit
    Kayseri verisinin (7 parsel, 8 boru segmenti, 4 saha noktası, vana-parsel
    eşlemesi, 7 özel çizim kuralı) `kayseri-ana` bölgesine aktarılması

## Kurulum sihirbazı — Aşama 2 (çizim motoru veriye bağlandı)

`src/harita.js` artık sabit dizi içermiyor; parsel/boru/nokta verisini ve
fıskiye özel kurallarını veritabanından okuyor.

> ⚠️ **Sıra kritik:** 12 ve 13 numaralı dosyalar Supabase'de çalıştırılmadan
> yeni kod deploy edilirse Kayseri haritası parselsiz/borusuz açılır ve özel
> fıskiye kuralları uygulanmaz (uygulama çökmez, sadece eksik çizer).
> **Önce SQL, sonra deploy.**

14. `supabase_kurulum_tamam_kayseri.sql` — yalnızca harita görünümü sahada
    doğrulandıktan SONRA: `kayseri-ana` için `kurulum_tamam = true`

## Kurulum sihirbazı — Aşama 3 (çok bölgelilik düzeltmesi)

15. `supabase_duzeltme_vana_tekil_bolgeye_gore.sql` — vana tekilliğini
    `(isaretci_no, yon)` yerine `(bolge_id, isaretci_no, yon)` yapar

> ⚠️ Bu düzeltme **ikinci bir bölge kurmadan önce** çalıştırılmalıdır.
> Eski indekste `bolge_id` yoktu; işaretçi numaraları tüm sistemde benzersiz
> olmak zorundaydı, dolayısıyla yeni bir tarla "İşaretçi 1"i ekleyemiyordu.
> Mevcut Kayseri verisini etkilemez.
>
> Sıra önemli: 2/4/13 numaralı vana dosyaları
> `on conflict (isaretci_no, coalesce(yon,'-'))` kullandığı için bu düzeltme
> onlardan **sonra** çalıştırılmalıdır.

## Tek seferlik düzeltmeler (tarihçe — tekrar çalıştırılmaz)
- `supabase_temizlik_*.sql`            — test verisi temizlikleri
- `supabase_duzeltme_*.sql`            — saha akışı düzeltmeleri
- `supabase_kesin_duzeltme.sql`        — 19 Temmuz akış düzeltmesi
