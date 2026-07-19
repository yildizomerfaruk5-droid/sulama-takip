# Veritabanı SQL Dosyaları

Supabase SQL Editor'da çalıştırılmış migration ve düzeltmelerin arşivi.
**Hepsi zaten çalıştırıldı** — yeni bir kurulumda sırayla çalıştırılır:

## Kurulum sırası (yeni ortam için)
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

## Tek seferlik düzeltmeler (tarihçe — tekrar çalıştırılmaz)
- `supabase_temizlik_*.sql`            — test verisi temizlikleri
- `supabase_duzeltme_*.sql`            — saha akışı düzeltmeleri
- `supabase_kesin_duzeltme.sql`        — 19 Temmuz akış düzeltmesi
