import { supabase } from './supabase.js'

export async function girisYap(email, sifre) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: sifre
  })

  if (error) return { basarili: false, hata: error.message }

  // Giriş geçmişine kaydet
  await supabase.from('giris_gecmisi').insert({
    kullanici_email: email,
    giris_zamani: new Date().toISOString(),
    cihaz: navigator.userAgent.substring(0, 200)
  })

  return { basarili: true, kullanici: data.user }
}

export async function cikisYap() {
  await supabase.auth.signOut()
}

export async function mevcutKullanici() {
  const { data } = await supabase.auth.getSession()
  return data.session?.user || null
}

export async function girisGecmisiniGetir() {
  const { data, error } = await supabase
    .from('giris_gecmisi')
    .select('*')
    .order('giris_zamani', { ascending: false })
    .limit(20)

  if (error) return []
  return data
}

export function loginHTML() {
  return `
    <div style="
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0f1923;
      padding: 20px;
      box-sizing: border-box;
    ">
      <div style="
        background: #1a2634;
        border: 1px solid #2c3e50;
        border-radius: 12px;
        padding: 28px 24px;
        width: 100%;
        max-width: 360px;
        box-sizing: border-box;
      ">
        <h1 style="
          color: #5dade2;
          font-size: 20px;
          margin-bottom: 8px;
          text-align: center;
        ">🌾 SULAMA TAKİP</h1>
        <p style="
          color: #7f8c8d;
          font-size: 13px;
          text-align: center;
          margin-bottom: 28px;
        ">Admin Girişi</p>

        <div style="margin-bottom: 16px;">
          <label style="color:#bdc3c7; font-size:13px; display:block; margin-bottom:6px;">
            E-posta
          </label>
          <input 
            id="login-email"
            type="email" 
            placeholder="admin@example.com"
            style="
              width: 100%;
              min-height: 48px;
              padding: 10px 14px;
              background: #0f1923;
              border: 1px solid #2c3e50;
              border-radius: 8px;
              color: #e0e0e0;
              /* 16px: iOS Safari daha kucuk yazili alana odaklaninca
                 sayfayi otomatik yakinlastirir — 16px bunu engeller */
              font-size: 16px;
              outline: none;
              box-sizing: border-box;
            "
          />
        </div>

        <div style="margin-bottom: 24px;">
          <label style="color:#bdc3c7; font-size:13px; display:block; margin-bottom:6px;">
            Şifre
          </label>
          <input 
            id="login-sifre"
            type="password" 
            placeholder="••••••••"
            style="
              width: 100%;
              min-height: 48px;
              padding: 10px 14px;
              background: #0f1923;
              border: 1px solid #2c3e50;
              border-radius: 8px;
              color: #e0e0e0;
              /* 16px: iOS Safari daha kucuk yazili alana odaklaninca
                 sayfayi otomatik yakinlastirir — 16px bunu engeller */
              font-size: 16px;
              outline: none;
              box-sizing: border-box;
            "
          />
        </div>

        <button
          onclick="loginYap()"
          style="
            width: 100%;
            min-height: 48px;
            padding: 12px;
            background: #2e86de;
            border: none;
            border-radius: 8px;
            color: #fff;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
          "
        >Giriş Yap</button>

        <div id="login-hata" style="
          color: #ff4757;
          font-size: 13px;
          text-align: center;
          margin-top: 12px;
          min-height: 20px;
        "></div>
      </div>
    </div>
  `
}

export function girisGecmisiHTML(kayitlar) {
  if (kayitlar.length === 0) {
    return '<div style="color:#7f8c8d; font-size:13px;">Henüz giriş kaydı yok.</div>'
  }

  return kayitlar.map(k => {
    const tarih = new Date(k.giris_zamani).toLocaleString('tr-TR')
    const cihaz = k.cihaz || '-'
    const kisaCihaz = cihaz.includes('iPhone') ? '📱 iPhone' :
                      cihaz.includes('Android') ? '📱 Android' :
                      cihaz.includes('Windows') ? '💻 Windows' :
                      cihaz.includes('Mac') ? '💻 Mac' : '🖥️ Diğer'

    return `
      <div style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 14px;
        background: #0f1923;
        border: 1px solid #2c3e50;
        border-radius: 6px;
        margin-bottom: 6px;
        font-size: 13px;
      ">
        <div>
          <div style="color:#e0e0e0; font-weight:bold;">${k.kullanici_email}</div>
          <div style="color:#7f8c8d; font-size:12px;">${tarih}</div>
        </div>
        <div style="color:#7f8c8d;">${kisaCihaz}</div>
      </div>
    `
  }).join('')
}