import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Enable cross-subdomain SSO with code.agentme.app
// On localhost, don't set domain (use default). In production, use parent domain.
const isLocalhost = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
const cookieDomain = isLocalhost ? undefined : '.agentme.app'

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createBrowserClient(supabaseUrl, supabaseAnonKey, {
        cookieOptions: {
          domain: cookieDomain,
          path: '/',
          sameSite: 'lax',
          secure: import.meta.env.PROD,
        },
      })
    : null

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

