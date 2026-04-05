import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
})

export const PRICES = {
  flatshare: process.env.STRIPE_PRICE_FLATSHARE!,
  rental:    process.env.STRIPE_PRICE_RENTAL!,
  sublet:    process.env.STRIPE_PRICE_SUBLET!,
  tenant:    process.env.STRIPE_PRICE_TENANT_MONTHLY!,
}

export const LISTING_AMOUNTS = {
  flatshare: 1500, // £15/week in pence
  rental:    1500, // £15/week
  sublet:    2000, // £20/week
}
