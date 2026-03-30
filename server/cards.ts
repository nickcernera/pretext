import type { DeathStats } from '../shared/protocol'

type CardPayload = {
  h: string   // handle
  t: number   // timeAlive
  k: number   // kills
  p: number   // peakMass
  v: string[] // victims
  b: string   // killedBy
  r: string   // roomCode
}

export function decodeCardPayload(encoded: string): { stats: DeathStats; roomCode: string } | null {
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(padded)
    const data = JSON.parse(json) as CardPayload
    return {
      stats: {
        handle: String(data.h || ''),
        timeAlive: Number(data.t) || 0,
        kills: Number(data.k) || 0,
        peakMass: Number(data.p) || 0,
        victims: Array.isArray(data.v) ? data.v.map(String) : [],
        killedBy: String(data.b || ''),
      },
      roomCode: String(data.r || ''),
    }
  } catch {
    return null
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function generateShareCard(stats: DeathStats, roomCode: string): string {
  const timeAlive = Math.round(stats.timeAlive / 1000)
  const minutes = Math.floor(timeAlive / 60)
  const seconds = timeAlive % 60
  const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
  const victimsStr = stats.victims.length > 0
    ? stats.victims.slice(0, 5).map(escapeXml).join(', ')
    : 'none'
  const handle = escapeXml(stats.handle)
  const killedBy = escapeXml(stats.killedBy || 'the arena')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#050a08"/>
      <stop offset="50%" style="stop-color:#0a1a10"/>
      <stop offset="100%" style="stop-color:#050a08"/>
    </linearGradient>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feBlend in="SourceGraphic" mode="overlay"/>
    </filter>
  </defs>

  <rect width="1200" height="675" fill="url(#bg)"/>
  <rect width="1200" height="675" fill="url(#bg)" filter="url(#grain)" opacity="0.05"/>

  <!-- Border -->
  <rect x="20" y="20" width="1160" height="635" rx="8" fill="none" stroke="#3a5a4a" stroke-width="1" opacity="0.5"/>

  <!-- Title -->
  <text x="600" y="80" text-anchor="middle" font-family="'Space Grotesk', system-ui, sans-serif" font-size="28" fill="#4a7a5a">pretext arena</text>

  <!-- Handle -->
  <text x="600" y="180" text-anchor="middle" font-family="'Space Grotesk', system-ui, sans-serif" font-size="64" font-weight="700" fill="#d0ffe0">${handle}</text>

  <!-- Killed by -->
  <text x="600" y="240" text-anchor="middle" font-family="'Space Mono', monospace" font-size="20" fill="#4a7a5a">devoured by ${killedBy}</text>

  <!-- Stats row -->
  <text x="250" y="340" text-anchor="middle" font-family="'Space Mono', monospace" font-size="14" fill="#4a7a5a">KILLS</text>
  <text x="250" y="380" text-anchor="middle" font-family="'Space Grotesk', system-ui, sans-serif" font-size="48" font-weight="700" fill="#d0ffe0">${stats.kills}</text>

  <text x="600" y="340" text-anchor="middle" font-family="'Space Mono', monospace" font-size="14" fill="#4a7a5a">TIME ALIVE</text>
  <text x="600" y="380" text-anchor="middle" font-family="'Space Grotesk', system-ui, sans-serif" font-size="48" font-weight="700" fill="#d0ffe0">${escapeXml(timeStr)}</text>

  <text x="950" y="340" text-anchor="middle" font-family="'Space Mono', monospace" font-size="14" fill="#4a7a5a">PEAK MASS</text>
  <text x="950" y="380" text-anchor="middle" font-family="'Space Grotesk', system-ui, sans-serif" font-size="48" font-weight="700" fill="#d0ffe0">${Math.round(stats.peakMass)}</text>

  <!-- Victims -->
  <text x="600" y="470" text-anchor="middle" font-family="'Space Mono', monospace" font-size="14" fill="#4a7a5a">VICTIMS</text>
  <text x="600" y="510" text-anchor="middle" font-family="'Space Mono', monospace" font-size="18" fill="#d0ffe0">${victimsStr}</text>

  <!-- Footer -->
  <text x="600" y="610" text-anchor="middle" font-family="'Space Mono', monospace" font-size="16" fill="#4a7a5a">pretextarena.io${roomCode ? ' / ' + escapeXml(roomCode) : ''}</text>
  <text x="600" y="640" text-anchor="middle" font-family="'Space Mono', monospace" font-size="11" fill="#3a5a4a">by Cernera Design · powered by Pretext</text>
</svg>`
}
