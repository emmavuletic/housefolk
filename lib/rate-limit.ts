import { createServerClient } from '@/lib/supabase-server'

// Supabase-backed rate limiter — works across Vercel serverless instances
// Requires a `rate_limits` table (see README for SQL)
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  try {
    const supabase = createServerClient()
    const now = Date.now()
    const resetAt = new Date(now + windowMs).toISOString()

    const { data } = await supabase
      .from('rate_limits')
      .select('count, reset_at')
      .eq('key', key)
      .single()

    // Not found or window expired — reset
    if (!data || new Date(data.reset_at).getTime() < now) {
      await supabase.from('rate_limits').upsert({ key, count: 1, reset_at: resetAt })
      return true
    }

    // Over limit
    if (data.count >= limit) return false

    // Increment
    await supabase.from('rate_limits').update({ count: data.count + 1 }).eq('key', key)
    return true
  } catch {
    // Fail open — don't block requests if rate limit table is unavailable
    return true
  }
}
