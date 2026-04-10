import { Resend } from 'resend'

export const resend = new Resend(process.env.RESEND_API_KEY)

export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'emma@housefolk.co'

// Next Thursday date helper
export function nextThursday(): Date {
  const now = new Date()
  const daysUntil = (4 - now.getDay() + 7) % 7 || 7
  const thu = new Date(now)
  thu.setDate(now.getDate() + daysUntil)
  thu.setHours(8, 0, 0, 0)
  return thu
}
