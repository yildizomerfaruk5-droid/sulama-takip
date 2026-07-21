# Sulama Takip ve Görselleştirme Sistemi

**Gerçek bir tarım işletmesinde aktif kullanılan, saha verisiyle beslenen sulama otomasyon ve izleme platformu.**

Geliştirici: Ömer Faruk Yıldız · 2026 · Kayseri
Canlı: https://sulama-takip.vercel.app · Kaynak: github.com/yildizomerfaruk5-droid/sulama-takip

---

## Kısa Tanıtım (portfolyo kartı için — 2 cümle)

> 246 dekarlık bir tarım arazisinde sulamanın planlanması, izlenmesi ve raporlanması için
> geliştirdiğim web platformu. GPS ile ölçülmüş 1.500 fıskiyelik altyapıyı uydu haritası
> üzerinde canlı gösteriyor, sulama hatları arasındaki geçişleri sunucu tarafında otomatik
> yapıyor ve tüm sezonu su tüketimi/gübre bazında raporluyor.

## Orta Uzunlukta Açıklama (proje detay sayfası için)

Bu proje, saha çalışanlarının kâğıda not tuttuğu, "hangi hat ne zaman sulandı" bilgisinin
kaybolduğu bir süreci uçtan uca dijitalleştiriyor. Arazinin fiziksel altyapısı (34 vana,
~1.500 fıskiye, ana boru güzergâhı, 7 tapu parseli) GPS ölçümleriyle KML olarak toplandı,
işlenip veritabanına aktarıldı ve uydu haritası üzerinde metrik doğrulukla modellendi.

Sistem sulamayı hat hat yürütüyor: her hat bir vana grubu ve süresi dolduğunda sıradaki
hatta geçiş **veritabanının içinde** (PostgreSQL + pg_cron) otomatik yapılıyor — hiçbir
cihazın açık olması gerekmiyor. Harita canlı durum gösteriyor: çalışan hat mavi yanıp
sönüyor ve suladığı alan boyanıyor, tamamlananlar yeşil, sıradaki sarı, vanalar su geçişine
göre yeşil/kırmızı.

Tarla sahibi şifresiz bir izleme linkinden (veya telefonuna kurduğu PWA'dan) her şeyi canlı
takip ediyor ama hiçbir veriye müdahale edemiyor; yetkilendirme veritabanı seviyesinde
(Row Level Security) rol bazlı kilitli.

## Öne Çıkan Teknik Noktalar

- **Coğrafi veri işleme**: KML ayrıştırma, DMS↔ondalık dönüşüm, pusula yönü hesabı,
  metre bazlı koordinat ötelemesi, ray-casting ile poligon içi/dışı testi (fıskiyeler
  parsel sınırında kırpılıyor), yamuk tarlalar için özel dizilim kuralları.
- **Sunucusuz mimari**: özel backend yok; istemci doğrudan Supabase'e bağlanıyor.
  Zamanlanmış işler `pg_cron` ile veritabanı içinde çalışıyor — düşük maliyet, az bakım.
- **Gerçek zamanlı senkronizasyon**: Supabase Realtime ile bir cihazdaki değişiklik
  tüm açık ekranlara anında yansıyor.
- **Güvenlik**: RLS politikalarıyla rol bazlı yazma (yönetici / denetleyici / işçi / anon),
  anahtarların ortam değişkenlerine taşınması ve sızmış anahtarın rotasyonu,
  storage yükleme/silme kısıtları, tüm kritik işlemlerin denetim logu.
- **Veri bütünlüğü**: benzersiz indekslerle mükerrer kayıt koruması, saha gerçekliğiyle
  uyuşmayan verilerin migration'larla düzeltilmesi, tek tuşla tam JSON yedek + CSV arşiv.
- **PWA**: manifest + service worker; ağ zayıfken bile arayüz açılıyor, canlı veriler
  asla önbelleğe alınmıyor.

## Özellikler

| Alan | Özellik |
|---|---|
| Harita | Uydu görüntüsü üzerinde parseller, ana boru, kuyu, 34 vana, ~1.500 fıskiye; açılıp kapanan katmanlar; hat bazlı renklendirme; tıklanabilir detay balonları |
| Otomasyon | Hat/zona/tur geçişleri, sunucu tarafında zamanlı kontrol, acil durdurma, süre değiştirme |
| Saha verisi | Gübre kontrol listesi (miktar + birim + dekar/hat ölçeği), kameradan veya galeriden fotoğraf, serbest not |
| Raporlama | Dönem/su/hat/zona filtreli istatistikler, 4 grafik, hat detay tablosu, m³ su tüketimi, yazdırılabilir sezon raporu, CSV dışa aktarım |
| Çok bölgelilik | Sınırsız bölge (Kayseri, Konya, Nevşehir...), her biri kendi zonaları ve tur sayacıyla; bölge seçici |
| Roller | Genel yönetici / bölge denetleyicisi / işçi / şifresiz izleyici |
| Arşiv | Foto galerisi (hat ve su sırasına göre albümler), olay logları, ziyaretçi kayıtları, JSON yedek |

## Teknoloji

`Vanilla JavaScript (ES Modules)` · `Vite 8` · `Supabase (PostgreSQL, Auth, Storage, Realtime, pg_cron)`
· `Leaflet` · `Chart.js` · `PWA` · `Vercel` · `Git/GitHub`

Framework kullanılmadı: 12 modüllük, ~3.000 satırlık sade bir kod tabanı — bağımlılık az,
yükleme hızlı, bakım kolay.

## Sayılarla

- **246 dekar** arazi · **7 parsel** · **2 zona**
- **34 vana** (43 yönlü kayıt) · **~1.500 fıskiye** GPS'le konumlandırıldı
- **12 veritabanı tablosu** · **~3.000 satır** kod · **12 JS modülü**
- **90 m³/saat** kuyu debisiyle su tüketimi takibi
- Sezon boyunca aktif kullanımda; her sulama turu kayıt altında

## Ekran Görüntüsü Önerileri (portfolyo için)

1. Uydu haritası — hat renkleriyle dolu fıskiye desenleri (en etkileyici görsel)
2. Çalışan hat paneli — canlı sayaç, kalan süre, saat aralığı
3. İstatistik ekranı — grafikler ve hat detay tablosu
4. Telefonda PWA görünümü (viewer ekranı)

## Gelecek Planı

Yerel/çevrimdışı kurulum (Docker + Supabase self-hosted) ve kendi saha verisiyle beslenen
yerel bir yapay zekâ asistanı: doğal dil sorguları ve sulama süresi önerileri — veri hiç
dışarı çıkmadan. Ayrıca ESP32/LoRa toprak nemi sensörleriyle (MikroKlima-DSS) entegrasyon.

---

*developed by Ömer Faruk Yıldız*
