'use client'
import { useEffect } from 'react'

// Client-side redirect so the URL hash (e.g. #access_token=... from Google OAuth)
// is preserved when forwarding to /homefolk.html.
// Server-side redirects strip the hash fragment.
export default function Home() {
  useEffect(() => {
    window.location.replace('/homefolk.html' + window.location.search + window.location.hash)
  }, [])
  return null
}
