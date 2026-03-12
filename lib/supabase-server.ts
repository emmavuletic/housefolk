import { createClient } from '@supabase/supabase-js'

// Server-side client with secret key — never exposed to browser
export function createServerClient() {
  return createClient(
    'https://agfgtajovhhxswfdcqen.supabase.co',
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
