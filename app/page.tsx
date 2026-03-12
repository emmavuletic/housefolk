// Redirect root → /homefolk.html, preserving hash (needed for Google OAuth callback)
// Uses an inline script so it runs before React hydration — no webpack bundle required.
export default function Home() {
  return (
    <script
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `window.location.replace('/homefolk.html'+location.search+location.hash)`,
      }}
    />
  )
}
