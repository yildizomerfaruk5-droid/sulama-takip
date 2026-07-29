# Claude Code'a Verilecek Prompt

> Aşağıdaki metni Claude Code'a olduğu gibi yapıştır.
> Proje klasöründe (`sulama-takip`) çalıştır.

---

## AŞAMA 1 İÇİN PROMPT (ilk mesaj)

```
Bu projede bir "kurulum sihirbazı" geliştireceğiz. Detaylı spesifikasyon
KURULUM_SIHIRBAZI_SPEC.md dosyasında — önce onu ve README.md'yi oku.

Proje: canlıda, gerçek bir tarımda aktif kullanılan sulama takip sistemi.
Kayseri'de 25 hat, 97 vana, ~2.400 fıskiye ile şu anda sulama yapılıyor.
Yani ÇALIŞAN BİR SİSTEMİ bozmadan geliştireceğiz — bu en önemli kısıt.

Bu oturumda sadece SPEC'İN 8. BÖLÜMÜNDEKİ 1. AŞAMAYI yap:
yeni tabloları oluştur, RLS politikalarını kur ve mevcut sabit kodlanmış
Kayseri verisini bu tablolara taşıyan seed migration'ı yaz.

Kapsam (bu aşamada SADECE bunlar):
1. sql/ klasörüne yeni bir migration dosyası:
   - parseller, boru_hatlari, saha_noktalari, vana_parselleri tabloları
   - vanalar tablosuna parsel_id ve cizim_kurali (jsonb) kolonları
   - bolgeler tablosuna fiskiye_araligi_m, fiskiye_kapsama_m, fiskiye_alan_m2,
     varsayilan_sure_dk, kurulum_tamam kolonları
   - Her tabloya RLS: okuma herkese açık, yazma public.aktif_rol() ile
     yonetici/denetleyici (mevcut desen: sql/supabase_migration_rls_guvenlik.sql)
2. Ayrı bir seed migration dosyası: src/harita.js içindeki PARSELLER (7 parsel),
   ANA_BORU_HATLARI (8 segment), KUYU, T_NOKTASI, VANA_NOKTALARI (3 nokta)
   verisini kayseri-ana bölgesine aktar. Koordinat sırası konvansiyonuna dikkat:
   parsellerde [lng,lat], borularda [lat,lng] — mevcut koddaki gibi.
3. Mevcut 97 vananın parsel metnini (örn. '119/7-119/6') vana_parselleri
   tablosuna eşle.
4. Spec Bölüm 6.4'teki 7 özel kuralı vanaların cizim_kurali alanına yaz.

KURALLAR:
- SQL dosyaları idempotent olmalı (birden fazla kez çalıştırılabilir).
- Bu aşamada src/ altındaki JS dosyalarına DOKUNMA. Harita hâlâ eski sabit
  veriyi kullanmaya devam etsin — veri iki yerde duracak, bu normal.
- Hiçbir mevcut tabloyu silme, mevcut kolonları değiştirme.
- Türkçe yorum ve adlandırma kullan (mevcut kod böyle).
- Bitirince: her tablo için satır sayısını ve özel kural atanan vanaları
  gösteren bir kontrol sorgusu ver.

Bitirdiğinde ne yaptığını özetle ve 2. aşamaya (harita.js refactor) geçmeden
önce benden onay iste.
```

---

## AŞAMA 2 İÇİN PROMPT (1. aşama bitip SQL'i Supabase'de çalıştırdıktan sonra)

```
1. aşama tamam, migration'ları Supabase'de çalıştırdım.

Şimdi spec'in 2. aşamasını yap: src/harita.js'i veri tabanından okuyacak
şekilde refactor et.

Kapsam:
- haritaOlustur(): PARSELLER, ANA_BORU_HATLARI, KUYU, T_NOKTASI,
  VANA_NOKTALARI sabitleri yerine parseller / boru_hatlari / saha_noktalari
  tablolarından okusun. fitBounds veriden hesaplansın.
- kayseriSahasi kontrolünü kaldır — her bölge kendi verisini çizsin.
- fiskiyeleriCiz(): isaretci_no === 58 / === 35 / === 1 || === 19 gibi tüm
  sabit kontroller ve BOSLUKLU / UZAT / KIRPMASIZ_SABIT sabitleri yerine
  v.cizim_kurali.tip üzerinden çalışan bir switch yapısı kur.
  Spec Bölüm 3.5'teki 7 kural tipini destekle.
- Mevcut yardımcı fonksiyonları koru: metreOtele, yonHesapla, poligonIcinde,
  mesafeM, kenarBoyuncaNoktalar, kalanParcayiDoldur — parametrelerini
  kuraldan al.
- Kırpma alanı artık vana_parselleri üzerinden gelsin (çok parselli destek).
- fiskiye aralığı/kapsama sabitleri bolgeler tablosundaki ayarlardan okunsun.

DEĞİŞMEMESİ GEREKENLER (bunları bozarsan sistem çalışmaz):
- Katman sistemi ve tercih hatırlama
- Hat renk paleti (HAT_PALET) ve canlı durum renkleri (HAT_RENK):
  aktif #1450b8 yanıp sönen, tamamlanan yeşil, sıradaki sarı
- Vana ve fıskiye popup içerikleri
- "🎯 görünümü sıfırla" butonu, Ctrl+tıklama koordinat seçici
- vanalariHaritayaCiz(bolgeId, sistemDurumu, tamamlananlar) imzası
  (main.js ve viewer.js bunu çağırıyor)

KABUL KRİTERİ: Refactor sonrası Kayseri haritası ESKİSİYLE BİREBİR AYNI
görünmeli — aynı fıskiye konumları, aynı sayılar, aynı renkler, aynı
popup metinleri. Karşılaştırmayı nasıl doğruladığını anlat.

npm run build hatasız geçmeli. Bitirince değişiklikleri özetle ve
sabit dizileri silmeden önce benden onay iste.
```

---

## AŞAMA 3-6 İÇİN PROMPT (motor refactor'ü doğrulandıktan sonra)

```
Harita motoru veriden çalışıyor ve Kayseri görünümü doğru. Şimdi kurulum
sihirbazı arayüzünü yap — spec Bölüm 4/PARÇA B.

Bu oturumda spec'in 8. bölümündeki [3 ve 4]. aşamaları yap:
- src/kurulum.js (yeni dosya)
- Admin panele "⚙️ Kurulum" bağlantısı (yalnızca rol = 'yonetici' görsün)
- Adım 1: Bölge (ad, kod, il/ilçe, harita merkezi, zoom, fıskiye ayarları)
- Adım 2: Zonalar (ad, açıklama, sıra no; ekle/düzenle/sil)
- Adım 3: Parseller — KML yükleme + ayrıştırma önizlemesi + haritada çizim
- Adım 4: Ana boru ve saha noktaları (KML + haritada çizim)

KML ayrıştırıcıyı ayrı bir modüle koy (src/kml.js) — Adım 5'te vanalar için
de kullanılacak. DOMParser ile çalışsın, yeni bağımlılık ekleme.

Tasarım: mevcut koyu tema, mevcut CSS sınıfları (.bolum, .ist-grafik-kutu vb.),
template literal deseni. Framework yok. Mobilde kullanılabilir olmalı.

Bitirince adım 5-6'ya (vanalar + hatlar) geçmeden önce bana göster.
```

---

## AŞAMA 5-6 İÇİN PROMPT (en kritik ekranlar)

```
Şimdi sihirbazın en kritik iki ekranını yap:

ADIM 5 — Vanalar:
- KML'den vana içe aktarma. <description> ayrıştırma örnekleri:
    "32 alt"                         → alt: 32
    "31 alt / 25 üst" (satır satır)  → alt: 31, üst: 25
    "6+2 alt"                        → alt: 8, orijinal metin nota
    "50lik 6"                        → 6 (çap ifadesi ayıklanır, nota)
    "9 normal / 7 75lik artırma / 4 hortum" → ana 9 + yan sıra kuralı önerisi
  Ayrıştırılamayanı KIRMIZI işaretle, kullanıcı elle düzeltsin.
  ASLA sessizce tahmin etme — yanlış veri sistemin en büyük riski.
- Ekim yönü yardımcısı: haritada iki nokta seç → pusula açısı hesapla
- Toplu düzenleme: seçili vanalara aynı yön/parsel/boru hattı ata
- Özel kural editörü: spec Bölüm 3.5'teki 7 tip, form + haritada canlı önizleme
- Haritaya tıklayarak vana ekleme, sürükleyerek konum düzeltme

ADIM 6 — Hatlar:
- Sol: hat listesi, sağ: harita üzerinde vana seçimi
- Seçim yaptıkça canlı toplam fıskiye + kapasite uyarısı
  (yeşil 75-95, sarı 60-75 / 95-110, kırmızı dışı)
- hatlar.fiskiye_sayisi daima vana toplamından hesaplanıp yazılsın
- Kurulum özeti: X parsel, Y vana, Z hat, N fıskiye, toplam alan
- Eksik uyarıları: hatsız vana, bant dışı hat, ekim yönü boş vana
- "Kurulumu tamamla" → bolgeler.kurulum_tamam = true

Sonra spec Bölüm 7'deki kabul kriterlerini tek tek kontrol et ve sonucu
raporla. Özellikle: Kayseri verisi bozulmadı mı, sulama akışı (pg_cron,
döngüsel tur, sayaç) etkilenmedi mi, viewer ve PWA çalışıyor mu.
```

---

## HER OTURUMDA HATIRLATILACAKLAR

Claude Code uzun oturumlarda bağlamı kaybederse şu notu tekrar ver:

```
Hatırlatma — bu projenin değişmez kuralları:
- Vanilla JS, framework yok, yeni CDN bağımlılığı yok (Leaflet + Chart.js dışı yasak)
- Türkçe kod yorumu ve adlandırma
- sulama_kayitlari.sure_dakika DOLU = gerçek sulama tamamlaması,
  BOŞ = fotoğraf/gübre veri girişi. Bu ayrım her yerde kullanılıyor, bozma.
- Hat geçişleri yalnızca sunucuda (pg_cron/hat_gecis_kontrol) yapılır,
  tarayıcı geçiş tetiklemez — mükerrer kayıt olur.
- SQL dosyaları sql/ klasörüne, idempotent
- Commit: git -c user.email="yildizomerfaruk5-droid@users.noreply.github.com"
- Sistem CANLIDA ve şu anda gerçek sulama yapıyor. Veri kaybettirecek
  hiçbir işlem yapma; silme gerekiyorsa önce sor.
```

---

## SORUN ÇIKARSA

Claude Code bir şeyi bozarsa:

```
git log --oneline -10          # son commit'leri gör
git diff HEAD~1                # son değişikliği incele
git revert <commit>            # geri al (history korunur)
```

Supabase tarafında: admin panelden **💾 Yedek İndir** ile her aşama öncesi
JSON yedek al. Migration bozarsa yedekten geri yükleme yapılabilir.
