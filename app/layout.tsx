import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Housefolk — UK Rental Listings',
  description: 'Find your perfect home. Flatshares, rentals and sublets across the UK.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
