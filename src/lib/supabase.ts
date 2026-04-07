import { createClient } from '@supabase/supabase-js'

// this is shared across the whole app so auth and data calls all point at the same client instance
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
