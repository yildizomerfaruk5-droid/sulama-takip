import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Supabase ortam degiskenleri eksik! ' +
    'Lokal gelistirme icin .env dosyasi olusturun (bkz. .env.example), ' +
    'Vercel icin Settings > Environment Variables bolumune ekleyin.'
  )
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
