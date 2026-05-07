import { NextResponse } from 'next/server'

export async function GET() {
  const res = await fetch('https://api.hypixel.net/resources/skyblock/items', {
    cache: 'no-store',
  })

  if (!res.ok) {
    return NextResponse.json(
      { error: `Hypixel Items API ${res.status}` },
      { status: res.status }
    )
  }

  const data = await res.json()
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=120' },
  })
}
