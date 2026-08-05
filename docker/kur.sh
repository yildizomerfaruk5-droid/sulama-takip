#!/usr/bin/env bash
# ============================================================
# SULAMA TAKIP — YEREL KURULUM
#
# Kullanim:
#   ./kur.sh --eposta yonetici@ornek.com --sifre 'GucluSifre123!'
#
# Secenekler:
#   --eposta   <adres>   ilk yonetici hesabinin e-postasi   (zorunlu)
#   --sifre    <sifre>   ilk yonetici hesabinin sifresi     (zorunlu)
#   --ad       <ad>      mDNS adi (varsayilan: sulama)      -> sulama.local
#   --port     <port>    web portu (varsayilan: 80)
#   --mdns-yok           avahi/mDNS kurulumunu atla
#   --docker-yok         Docker kurulumunu atla (zaten kuruluysa)
#
# Hedef: Debian 12 / Raspberry Pi OS (Bookworm), ARM64 veya x86_64.
# ============================================================
set -euo pipefail

BETIK_DIZIN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPO_DIZIN="$(cd "$BETIK_DIZIN/.." && pwd)"

EPOSTA=""; SIFRE=""; MDNS_ADI="sulama"; PORT="80"
MDNS_KUR=1; DOCKER_KUR=1

while [ $# -gt 0 ]; do
  case "$1" in
    --eposta) EPOSTA="${2:-}"; shift 2 ;;
    --sifre)  SIFRE="${2:-}";  shift 2 ;;
    --ad)     MDNS_ADI="${2:-}"; shift 2 ;;
    --port)   PORT="${2:-}"; shift 2 ;;
    --mdns-yok)   MDNS_KUR=0; shift ;;
    --docker-yok) DOCKER_KUR=0; shift ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "Bilinmeyen secenek: $1"; exit 1 ;;
  esac
done

kirmizi() { printf '\033[31m%s\033[0m\n' "$*"; }
yesil()   { printf '\033[32m%s\033[0m\n' "$*"; }
mavi()    { printf '\033[36m\n== %s ==\033[0m\n' "$*"; }

if [ -z "$EPOSTA" ] || [ -z "$SIFRE" ]; then
  kirmizi "HATA: --eposta ve --sifre zorunlu."
  echo "Ornek: ./kur.sh --eposta yonetici@ornek.com --sifre 'GucluSifre123!'"
  exit 1
fi
if [ "${#SIFRE}" -lt 8 ]; then
  kirmizi "HATA: sifre en az 8 karakter olmali."
  exit 1
fi

# ============================================================
# 1. DOCKER
# ============================================================
mavi "1/8  Docker kontrolu"
if [ "$DOCKER_KUR" = 1 ] && ! command -v docker >/dev/null 2>&1; then
  echo "Docker bulunamadi, kuruluyor (Debian/Raspberry Pi OS)..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg \
    | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
                              docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker "$USER" || true
  yesil "Docker kuruldu. (Gruba eklendiniz — bu oturumda 'sudo docker' gerekebilir.)"
else
  yesil "Docker mevcut: $(docker --version 2>/dev/null || echo '?')"
fi

DC="docker compose"
docker compose version >/dev/null 2>&1 || DC="docker-compose"

# ============================================================
# 2. GIZLI ANAHTARLAR
# ============================================================
mavi "2/8  Guvenli anahtarlar uretiliyor"

rastgele() { openssl rand -base64 "$1" | tr -d '/+=\n' | cut -c1-"$2"; }

# HS256 JWT — harici bagimlilik yok, yalnizca openssl
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
jwt_uret() {
  local rol="$1" sir="$2" simdi son basl govde imza
  simdi=$(date +%s); son=$((simdi + 3600*24*365*10))   # 10 yil
  basl=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
  govde=$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$rol" "$simdi" "$son" | b64url)
  imza=$(printf '%s.%s' "$basl" "$govde" \
         | openssl dgst -sha256 -hmac "$sir" -binary | b64url)
  printf '%s.%s.%s' "$basl" "$govde" "$imza"
}

ENV_DOSYA="$BETIK_DIZIN/.env"
if [ -f "$ENV_DOSYA" ]; then
  yesil ".env zaten var — anahtarlar korunuyor."
else
  POSTGRES_SIFRE=$(rastgele 36 32)
  JWT_SECRET=$(rastgele 48 40)
  REALTIME_ENC_KEY=$(openssl rand -hex 8)              # tam 16 karakter
  REALTIME_SECRET_KEY_BASE=$(rastgele 96 64)           # tam 64 karakter
  ANON_KEY=$(jwt_uret anon "$JWT_SECRET")
  SERVICE_ROLE_KEY=$(jwt_uret service_role "$JWT_SECRET")

  cat > "$ENV_DOSYA" <<EOF
# kur.sh tarafindan uretildi — $(date '+%Y-%m-%d %H:%M')
# Bu dosyayi kimseyle paylasmayin, yedegini guvenli tutun.
POSTGRES_SIFRE=$POSTGRES_SIFRE
JWT_SECRET=$JWT_SECRET
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
REALTIME_ENC_KEY=$REALTIME_ENC_KEY
REALTIME_SECRET_KEY_BASE=$REALTIME_SECRET_KEY_BASE
GENEL_ADRES=http://${MDNS_ADI}.local$([ "$PORT" = 80 ] || echo ":$PORT")
WEB_PORT=$PORT
ISLETME_ADI=Isletme
STUDIO_PORT=3000
EOF
  chmod 600 "$ENV_DOSYA"
  yesil "Rastgele anahtarlar uretildi -> docker/.env (chmod 600)"
fi

set -a; . "$ENV_DOSYA"; set +a

# Ornek/varsayilan deger sizmasina karsi son savunma
case "$JWT_SECRET$POSTGRES_SIFRE$ANON_KEY" in
  *DEGISTIR*|*your-super-secret*|*super-secret-jwt*)
    kirmizi "HATA: .env hala ornek deger iceriyor. Kurulum durduruldu."
    exit 1 ;;
esac

# Kong yapilandirmasini gercek anahtarlarla uret
sed -e "s|\${ANON_KEY}|$ANON_KEY|g" \
    -e "s|\${SERVICE_ROLE_KEY}|$SERVICE_ROLE_KEY|g" \
    "$BETIK_DIZIN/kong.yml" > "$BETIK_DIZIN/kong.uretilmis.yml"

# ============================================================
# 3. UYGULAMA BUILD'I
# ============================================================
mavi "3/8  Uygulama derleniyor"
cat > "$DEPO_DIZIN/.env.production" <<EOF
VITE_SUPABASE_URL=$GENEL_ADRES
VITE_SUPABASE_ANON_KEY=$ANON_KEY
EOF

if command -v npm >/dev/null 2>&1; then
  (cd "$DEPO_DIZIN" && npm ci --silent && npm run build)
else
  echo "npm yok — derleme Docker icinde yapiliyor..."
  docker run --rm -v "$DEPO_DIZIN":/uyg -w /uyg node:20-alpine \
    sh -c "npm ci --silent && npm run build"
fi
yesil "dist/ hazir"

# ============================================================
# 4. SERVISLER
# ============================================================
mavi "4/8  Servisler baslatiliyor"
cd "$BETIK_DIZIN"
$DC up -d

printf 'Veritabani hazirlaniyor'
for _ in $(seq 1 60); do
  if $DC exec -T db pg_isready -U postgres >/dev/null 2>&1; then break; fi
  printf '.'; sleep 2
done
echo ""
$DC exec -T db pg_isready -U postgres >/dev/null 2>&1 \
  || { kirmizi "Veritabani acilmadi. Gunlukler:  $DC logs db"; exit 1; }
yesil "Veritabani hazir"

# ============================================================
# 5. MIGRATIONLAR
# ============================================================
mavi "5/8  Veritabani semasi kuruluyor"
hata=0
while IFS= read -r satir; do
  dosya=$(printf '%s' "$satir" | sed 's/#.*//' | xargs)
  [ -z "$dosya" ] && continue
  if [ ! -f "$DEPO_DIZIN/$dosya" ]; then
    kirmizi "  YOK   $dosya"; hata=$((hata+1)); continue
  fi
  if $DC exec -T db psql -U postgres -v ON_ERROR_STOP=1 -q \
       < "$DEPO_DIZIN/$dosya" >/dev/null 2>&1; then
    echo "  OK    $dosya"
  else
    kirmizi "  HATA  $dosya"
    $DC exec -T db psql -U postgres -v ON_ERROR_STOP=1 -q \
      < "$DEPO_DIZIN/$dosya" 2>&1 | grep -E "ERROR|HATA" | head -3 | sed 's/^/          /'
    hata=$((hata+1))
  fi
done < "$BETIK_DIZIN/migrasyon_sirasi.txt"

[ "$hata" -eq 0 ] || { kirmizi "$hata migration basarisiz — kurulum durduruldu."; exit 1; }
yesil "Sema kuruldu (isletme verisi YOK — sihirbazdan girilecek)"

# ============================================================
# 6. FOTOGRAF DEPOSU + ILK YONETICI
# ============================================================
mavi "6/8  Fotograf deposu ve yonetici hesabi"

$DC exec -T db psql -U postgres -q <<'SQL' >/dev/null
insert into storage.buckets (id, name, public)
values ('fotograflar', 'fotograflar', true)
on conflict (id) do nothing;
SQL
yesil "'fotograflar' deposu hazir"

printf 'Kimlik servisi bekleniyor'
for _ in $(seq 1 60); do
  if curl -fsS "http://localhost:${WEB_PORT}/auth/v1/health" >/dev/null 2>&1; then break; fi
  printf '.'; sleep 2
done
echo ""

yanit=$(curl -fsS -X POST "http://localhost:${WEB_PORT}/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EPOSTA\",\"password\":\"$SIFRE\",\"email_confirm\":true}" 2>&1) \
  || { kirmizi "Yonetici hesabi olusturulamadi:"; echo "$yanit"; exit 1; }

# Rol profili: RLS yazma yetkisi buna bakar (public.aktif_rol())
$DC exec -T db psql -U postgres -q <<SQL >/dev/null
insert into profiller (id, email, rol)
select id, email, 'yonetici' from auth.users where email = '$EPOSTA'
on conflict (id) do update set rol = 'yonetici';
SQL
yesil "Yonetici hesabi hazir: $EPOSTA"

# ============================================================
# 7. mDNS (sulama.local)
# ============================================================
mavi "7/8  Ag adi (mDNS)"
if [ "$MDNS_KUR" = 1 ]; then
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get install -y -qq avahi-daemon avahi-utils
    if [ "$(hostname)" != "$MDNS_ADI" ]; then
      echo "$MDNS_ADI" | sudo tee /etc/hostname >/dev/null
      sudo hostnamectl set-hostname "$MDNS_ADI" 2>/dev/null || true
      sudo sed -i "s/^127\.0\.1\.1.*/127.0.1.1\t$MDNS_ADI/" /etc/hosts || true
    fi
    sudo systemctl enable --now avahi-daemon >/dev/null 2>&1 || true
    yesil "Cihaz agda '${MDNS_ADI}.local' adiyla gorunecek"
  else
    echo "apt-get yok — mDNS atlandi. Adres olarak IP kullanin."
  fi
else
  echo "mDNS atlandi (--mdns-yok)"
fi

# ============================================================
# 8. TEMIZ KURULUM DOGRULAMASI
# ============================================================
mavi "8/8  Temiz kurulum dogrulamasi"
echo "Baska bir isletmeye ait veri kalmadigi kontrol ediliyor..."
echo ""
$DC exec -T db psql -U postgres -f - < "$BETIK_DIZIN/temiz_kurulum_kontrol.sql"

kirli=$($DC exec -T db psql -U postgres -tAc "
  select count(*) from (
    select 1 from bolgeler union all select 1 from zonalar
    union all select 1 from hatlar union all select 1 from vanalar
    union all select 1 from parseller union all select 1 from gubreler
  ) t;" 2>/dev/null | tr -d ' \r')

echo ""
if [ "${kirli:-1}" = "0" ]; then
  yesil "✅ TEMIZ KURULUM DOGRULANDI — hicbir tabloda yabanci veri yok"
else
  kirmizi "⚠️  Beklenmeyen veri bulundu ($kirli satir). Yukaridaki tabloyu inceleyin."
fi

# ============================================================
mavi "KURULUM TAMAM"
cat <<EOF

  Adres        : ${GENEL_ADRES}
  Yonetici     : ${EPOSTA}
  Izleme ekrani: ${GENEL_ADRES}/?viewer

  SONRAKI ADIM
    1) Telefondan ${GENEL_ADRES} adresini acin
    2) Yonetici hesabiyla girin
    3) "Kurulum Sihirbazi"ndan isletmenizin bolge/zona/parsel/
       vana/hat verisini girin

  Yararli komutlar (docker/ klasorunde)
    Durum      : $DC ps
    Gunlukler  : $DC logs -f
    Durdur     : $DC down
    Guncelle   : ./guncelle.sh
    DB paneli  : $DC --profile studio up -d   -> http://${MDNS_ADI}.local:${STUDIO_PORT}

  ⚠️  docker/.env dosyasini yedekleyin — kaybolursa veritabanina
     erisilemez hale gelir.

EOF
