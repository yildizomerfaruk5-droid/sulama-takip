import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://duxvvjklxvmrsrbzcwls.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1eHZ2amtseHZtcnNyYnpjd2xzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Nzk0NzEsImV4cCI6MjA5ODA1NTQ3MX0.fsWHT4g-jiSEJJzxa1stKwCRXkGVCM--e3DN97oTlMM'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)