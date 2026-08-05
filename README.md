# 🌾 Sulama Takip Sistemi

Tarım arazilerinde sulama faaliyetlerinin canlı harita, otomatik hat geçişi,
gübre/fotoğraf kaydı ve istatistiklerle izlendiği çok bölgeli web uygulaması.

> Geliştirici: **Ömer Faruk Yıldız (manco)** — 2026
> Canlı: https://sulama-takip.vercel.app · Viewer: `/?viewer`

---

## Hızlı Başlangıç (yeni geliştirici)

```bash
npm install
cp .env.example .env        # Supabase URL + publishable key gir
npm run dev                 # http://localhost:5173
```

Yeni bir Supabase ortamı kuruyorsan: `sql/README.md` içindeki sırayla
migration dosyalarını SQL Editor'da çalıştır.

**İlgili dokümanlar — hangisini ne zaman okuyacağın:**

| Dosya | Ne zaman oku |
|---|---|
| `sql/README.md` | Yeni bir Supabase ortamı kurarken — migration sırası |
| `KURULUM_SIHIRBAZI_SPEC.md` | Kurulum sihirbazının veri modelini/kural motorunu (`cizim_kurali`) anlaman gerektiğinde |
| `docs/YEREL_KURULUM.md` | Raspberry Pi / mini PC'de self-hosted kurulum yaparken |
| `CLAUDE_CODE_PROMPT.md` | Claude Code'a yeni bir özellik yazdırırken — bu projede kullanılan prompt deseni ve her oturumda hatırlatılması gereken kurallar |
| `docker/README` (docker-compose.yml yorumları) | Yerel stack'in servislerini/portlarını anlaman gerektiğinde |

## Teknoloji

| Katman | Teknoloji |
|---|---|
| Ön yüz | Vite 8 + Vanilla JS (framework yok, ES Modules) |
| Backend | Supabase: PostgreSQL + Auth + Storage + Realtime + pg_cron |
| Harita | Leaflet 1.9 + Google Satellite |
| Grafik | Chart.js 4 (CDN) |
| Dağıtım | GitHub → Vercel (push = otomatik deploy) |
| Mobil | PWA (manifest + service worker, "Ana Ekrana Ekle") |

Sunucu kodu YOKTUR: istemci doğrudan Supabase'e bağlanır; zamanlı hat
geçişleri veritabanı içinde `pg_cron` ile çalışır (dakikada bir
`hat_gecis_kontrol()` — cihazlar kapalıyken bile geçiş yapılır).

## Dosya Haritası

```
src/
  main.js        Admin uygulaması: render, sulama otomasyonu, tur/zona yönetimi
  viewer.js      Şifresiz izleme sayfası (?viewer), izleyici kimliği + IP kaydı
  harita.js      Leaflet: parseller, borular, vanalar, fıskiyeler, katmanlar,
                 hat renklendirme, canlı durum — geometri bir kez kurulur,
                 realtime güncellemede yalnızca durum/renk değişir (bkz.
                 haritaDurumGuncelle / haritaCanli, performans notu aşağıda)
  kurulum.js     Kurulum sihirbazı: bölge/zona/parsel/boru-nokta/vana/hat,
                 KML + GeoJSON içe aktarma, özel çizim kuralı editörü,
                 kurulum kilidi (aşağıya bak). Yalnızca yonetici görür.
  kml.js         KML ve GeoJSON (TKGM Parsel Sorgu) ayrıştırıcı — kurulum.js
                 ve harita.js'in paylaştığı saf fonksiyonlar
  offline.js     Çevrimdışı veri girişi kuyruğu (IndexedDB) — YALNIZCA foto/
                 gübre/not; hat başlatma/durdurma/süre KESİNLİKLE kuyruklanmaz
  izleyici.js    Viewer'da "Sen kimsin?" kimlik seçici (localStorage)
  popup.js       Hat veri girişi: işlem, not, gübre kontrol listesi (+ yeni
                 gübre tanımlama), fotoğraf — offline kuyruğa bağlı
  istatistik.js  Filtreli istatistikler, CSV dışa aktarım, sezon raporu
  galeri.js      Hat/su bazlı fotoğraf albümleri
  gecmis.js      Geçmiş kayıtlar listesi (+ yönetici silme)
  hatlar.js      Zona/hat sorguları, çalışan hat paneli
  log.js         Olay logları + ziyaretçi kayıtları (isim + IP)
  yedek.js       Tek tuşla JSON tam yedek
  bolge.js       Bölge ve kullanıcı profili sorguları
  auth.js        Giriş/çıkış, misafir modu
  supabase.js    İstemci (env değişkenlerinden)
sql/             Tüm migration/düzeltme SQL'leri (sırası sql/README.md'de).
                 *_sema.sql eşleri = aynı tablonun veri içermeyen kurulum
                 hâli (yerel kurulum için, bkz. docs/YEREL_KURULUM.md)
docker/          Yerel/self-hosted kurulum: docker-compose.yml, kur.sh,
                 guncelle.sh, .env.example (bkz. docs/YEREL_KURULUM.md)
docs/            YEREL_KURULUM.md — Raspberry Pi 5 / mini PC kurulum kılavuzu
public/          PWA: manifest, service worker (cache-first kabuk), ikonlar
                 (192/512 + ayrı maskable ikon), .well-known/assetlinks.json
                 (Play Store TWA doğrulaması)
```

## Veri Modeli (20+ tablo)

**Çekirdek akış:**
`bolgeler → zonalar → hatlar → sulama_kayitlari → gubre_uygulamalari`
`vanalar` (GPS envanteri, hat ataması, `parsel_id`, `cizim_kurali` jsonb) ·
`turlar` (1. Su, 2. Su...) ·
`sistem_durumu` (bölge başına aktif hat + hat_baslama_zamani) ·
`gubreler` (aktif/pasif, admin yönetimli) · `profiller` (roller) ·
`olay_loglari` · `giris_gecmisi` · `ziyaretci_loglari` (izleyici_id, ip)

**Saha/kurulum verisi** (kurulum sihirbazı, `KURULUM_SIHIRBAZI_SPEC.md`):
`parseller` · `boru_hatlari` · `saha_noktalari` · `vana_parselleri`
(çok-parselli vana desteği) — `bolgeler.kurulum_tamam`,
`fiskiye_araligi_m` / `fiskiye_kapsama_m` / `varsayilan_sure_dk`

**Diğer:** `izleyiciler` (viewer kimlik listesi, admin yönetimli) ·
`sulama_kayitlari.istemci_id` (offline kuyruk idempotency anahtarı)

Kritik ayrım: **`sure_dakika` dolu kayıtlar = gerçek hat tamamlamaları**;
boş olanlar = fotoğraf/gübre veri girişleri. (`islem_turu` kolonunun DB
varsayılanı 'sulama' olduğu için ayrımda KULLANILMAZ — tarihçe: bkz. commit
`6884787`.) **Bu ayrım offline kuyrukta da korunur** — `sure_dakika` dolu
hiçbir kayıt asla kuyruklanmaz (bkz. aşağıdaki geliştirici kuralları).

## İş Kuralları (özet)

- Hat = vana grubu (hedef 75-95 fıskiye; alt sınır ~57, üst basınç limiti)
- Kuyu debisi sabit **~90 m³/saat** → su tüketimi = süre × 90
- Renkler durumdan türetilir: aktif=koyu mavi (yanıp söner), sıradaki=sarı,
  bu turda tamamlanan=yeşil, beklemede=hattın kendi palet rengi
- Tur numarası bölge bazında sayılır; zona geçişi su numarasını değiştirmez
- RLS: okuma herkese açık (viewer şifresiz), yazma rol bazlı
  (yonetici/denetleyici tam, isci yalnız veri girişi, anon hiçbir şey)

## Geliştirici Kuralları (koda yazılı olmayan ama kırılırsa canlıyı bozan kararlar)

Bu proje **canlıda, gerçek bir tarımda aktif sulama yönetiyor** —
aşağıdakiler kod incelemesiyle bulunması zor ama ihlal edilirse sahada
gerçek zarar verecek kurallar. Yeni bir özellik eklerken önce burayı oku.

- **SQL her zaman deploy'dan önce çalıştırılır.** Migration'lar
  idempotent yazılır (`if not exists` / `on conflict`), böylece yanlışlıkla
  iki kez çalıştırmak zarar vermez. Sıra: SQL → Supabase'de çalıştır →
  kontrol sorgusunun çıktısını doğrula → ancak sonra `git push` / deploy.
- **`main`'e asla doğrudan commit atma, önce `git branch --show-current`
  ile kontrol et.** Bu depoda birkaç kez branch kontrolsüz commit atılıp
  yanlışlıkla `main`'e düştüğü oldu — zararsızdı (fast-forward) ama
  şansa bağlı olmamalı. Yeni iş her zaman `feature/*` branch'inde başlar,
  `main`'e merge etmeden önce lokal doğrulama + gerekiyorsa Vercel
  preview kontrolü yapılır.
- **Regresyon testleri gerçek üretim verisiyle karşılaştırılır,
  varsayımla değil.** `harita.js`'deki çizim motoru değiştirildiğinde,
  eski/yeni sürüm aynı veriyle çalıştırılıp ürettikleri TÜM noktalar
  (konum + popup metni) birebir karşılaştırılır. "Testler geçti" tek
  başına yeterli kanıt değildir — bu depoda testin kendisinin yanlış
  referansa baktığı veya sessizce sıfır kontrol çalıştırdığı birkaç kez
  yaşandı; şüpheli bir "hepsi geçti" sonucunu sorgula.
- **Offline kuyruk (`offline.js`) yalnızca "veri girişi" satırları
  içindir** — foto, gübre uygulaması, not. `sure_dakika` dolu kayıtlar
  (gerçek hat tamamlaması) ve hat başlatma/durdurma/süre değiştirme gibi
  sunucu-otoriter (`pg_cron`/`hat_gecis_kontrol()`) işlemler KESİNLİKLE
  kuyruklanmaz — gecikmeli oynatılırsa aktif hat/tur durumu bozulur.
  Tanım yazmaları da (gübre/izleyici ekleme) kuyruğa girmez, çünkü
  offline üretilen geçici id'ler FK ilişkilerini kırar.
- **Referans listeleri (gübreler, izleyiciler) silinmez, pasifleştirilir.**
  Geçmiş kayıtlar bu tablolara FK ile bağlı; silme geçmişi kırar.
  Admin arayüzünde "sil" yerine "pasifleştir/tekrar aktif et" deseni
  kullanılır, mükerrer ad `ilike` ile büyük/küçük harf duyarsız kontrol
  edilir.
- **RLS deseni tutarlı:** yeni bir tabloya yazma yetkisi eklerken mevcut
  `<tablo>_oku` (herkese select) + `<tablo>_yonet` (`aktif_rol() in
  ('yonetici','denetleyici')`) deseni tekrar edilir. Yeni bir yazma
  yolu eklendiğinde önce üretime karşı gerçekten test edilir (anon
  INSERT → 42501 bekleniyor mu?), varsayılmaz.
- **`harita.js`'deki `fiskiyeKonumlari()` ve `yonHesapla()` en kırılgan
  kod yolu.** Kural motoru (`cizim_kurali` — 7 tip: null/varsayılan,
  bosluk, uzat, sabit, yan_sira, kenar, alan_doldur) hem harita çizimini
  hem kurulum sihirbazındaki canlı önizlemeyi besliyor; ikisi aynı
  fonksiyonu paylaşır, ayrışmamalı.

## Yol Haritası

- [ ] Kalan hat grupları (güney-üst, kuzeybatı kolu) + Zona 2 envanteri
- [ ] Karavan konumu, harita renk lejantı
- [ ] Gübreleme programı + işçi resimli teyidi
- [x] Bölge çizimlerinin (parsel/boru) veritabanından okunması
      (`sql/README.md` → kurulum sihirbazı aşama 1-2)
- [x] Kurulum sihirbazı arayüzü (`KURULUM_SIHIRBAZI_SPEC.md` Parça B)
      — 6 adımın tamamı (bölge, zona, parsel, boru/nokta, vana + KML
      yükleyici + kural editörü, hatlar + kuyuya göre otomatik sıralama),
      kurulum özeti/tamamlama, bölge kopyalama, KML dışa aktarma ve
      kurulum kilidi (aşağıya bak)

### Kurulum kilidi — tam olarak ne korunuyor

Sulama açıkken (`sistem_durumu.sistem_acik`) o an sulanan hat
(`aktif_hat_id`) kurulum ekranından şöyle korunur:

| İşlem | Davranış |
|---|---|
| Aktif hattı silme | **Engellenir** (buton kapalı + uyarı) |
| Aktif hattaki vanayı silme | **Engellenir** |
| Vanayı aktif hatta ekleme / hattan çıkarma | **Engellenir** (tekil, toplu ve hat editörü yolları dahil) |
| Aktif hattın süresi veya sıra no'su | **Açık onay istenir** — eski/yeni değer gösterilir |
| Hat sırası değiştirme, kuyuya göre sıralama | Aktif hat etkileniyorsa **açık onay istenir** |

Süre ve sıra engellenmez çünkü sahada meşru ihtiyaçtır (sulamayı
uzatmak gibi); ama sunucudaki `hat_gecis_kontrol()` geçişi aktif hattın
`varsayilan_sure_dk` değerine göre tetiklediği ve sıradaki hattı
`sira_no`'dan seçtiği için onay penceresinde sonucu yazılı olarak
gösterilir.

**Korunmayanlar** (akışı etkilemez, yalnızca görünümü değiştirir):
fıskiye sayısı, ekim yönü, parsel bağlantısı, çizim kuralı ve vana
konumu — bunlar sulama sürerken de serbestçe düzenlenebilir.
- [x] **Offline veri girişi kuyruğu** (`src/offline.js`) — foto/gübre/not
      sinyal olmadan IndexedDB'de kuyruklanır, bağlantı gelince otomatik
      senkronlanır. Hat başlatma/durdurma bu kuyruğun DIŞINDA (yukarıya bak).
- [x] **Kurulum kilidi** — sulanan hat kurulum ekranından korunur (yukarıya bak)
- [x] **Realtime performans düzeltmesi** — harita her güncellemede yeniden
      kurulmak yerine yalnızca değişen durumu boyar (~8x hızlanma)
- [x] **Gübre/izleyici tanımları admin panelden yönetilir** — SQL yazmadan
      ekle/pasifleştir (`popup.js`, `main.js`)
- [x] **Play Store dağıtımı** — TWA paketleme (PWABuilder), Dahili Test
      track'i, `public/.well-known/assetlinks.json`
- [x] **Yerel/self-hosted kurulum altyapısı** (`feature/yerel-kurulum`
      branch'i, henüz `main`'e alınmadı) — bkz. `docs/YEREL_KURULUM.md`.
      Docker Compose ile self-hosted Supabase + uygulama tek `docker
      compose up` ile ayağa kalkıyor, `kur.sh` ilk kurulumu yapıyor,
      şema/veri ayrımı yapıldı (yeni işletme Kayseri verisiyle başlamıyor).
      pg_cron dahil tüm sunucu tarafı akış Docker'da uçtan uca doğrulandı.
      **Eksik tek şey gerçek Raspberry Pi 5 donanımında deneme** — ARM64
      şu an yalnızca QEMU emülasyonuyla doğrulandı, gerçek donanımda
      test edilmeden `main`'e alınmayacak.
- [ ] Yerel yapay zekâ katmanı (aşağıya bak — hâlâ vizyon aşamasında)

## Vizyon: Offline Yapay Zekâ

Uzun vadeli hedef: yerel kuruluma (yukarıda) ek olarak, kendi
verileriyle beslenen bir yapay zekâ asistanı — internetsiz, veri dışarı
sızmadan.

1. **Yerel barındırma** — ✅ yapıldı, bkz. Yol Haritası ve
   `docs/YEREL_KURULUM.md`.
2. **Veri disiplini (şu an yapılıyor)**: her sulama, gübre, fotoğraf ve
   olay zaman damgalı ve ilişkisel kaydediliyor; CSV/JSON dışa aktarımlar
   gelecekteki eğitim veri setinin ta kendisi. Ne kadar sezon birikirse
   model o kadar iyi olur — bugünkü titiz kayıt, yarının AI yakıtıdır.
3. **Yerel AI katmanı**: Ollama (veya benzeri) ile yerel LLM +
   veritabanına RAG bağlantısı → "geçen sezon Hat-5 kaç m³ su aldı?"
   gibi doğal dil soruları offline cevaplanır. Sayısal tahminler
   (sulama süresi önerisi, su ihtiyacı) için ayrıca küçük bir
   scikit-learn/TinyML modeli sezon verileriyle eğitilebilir.
   MikroKlima-DSS sensör ağı (toprak nemi) bağlandığında model girdileri
   hazır olur.

---

*developed by manco — Ömer Faruk Yıldız*
