import {
  WORLD_W, WORLD_H, ROOM_CAPACITY,
  MAX_HANDLE_LENGTH, MAX_AVATAR_LENGTH, MAX_ROOM_CODE_LENGTH,
  WS_MAX_PAYLOAD,
} from '../shared/constants'
import type { ClientMessage, ServerMessage } from '../shared/protocol'
import { RoomManager } from './room'
import type { WsData } from './room'
import { Simulation, splitPlayer } from './simulation'
import {
  exchangeCodeForToken, fetchUserInfo, createJWT,
  getTwitterAuthUrl, verifyJWT,
} from './auth'
import { generateShareCard, decodeCardPayload } from './cards'
import { StatsTracker } from './stats'
import { httpLimiter, wsLimiter } from './ratelimit'

const PORT = Number(process.env.PORT) || 3001

const roomManager = new RoomManager()
const stats = new StatsTracker()
const simulation = new Simulation(roomManager, stats)

function generatePlayerId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`
}

// --- CORS ---

const ALLOWED_ORIGINS = new Set([
  'https://pretext-mu.vercel.app',
  'https://pretextarena.io',
  'https://www.pretextarena.io',
])

if (process.env.NODE_ENV !== 'production') {
  ALLOWED_ORIGINS.add('http://localhost:5173')
  ALLOWED_ORIGINS.add('http://localhost:4173')
}

/** Check if an origin is allowed (exact match or Vercel preview subdomain) */
function isOriginAllowed(origin: string): boolean {
  if (ALLOWED_ORIGINS.has(origin)) return true
  // Allow Vercel preview deployments: https://<slug>-nickcerneras-projects.vercel.app
  if (/^https:\/\/pretext-[a-z0-9]+-nickcerneras-projects\.vercel\.app$/.test(origin)) return true
  return false
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    ...SECURITY_HEADERS,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Stats-Key',
    'Vary': 'Origin',
  }
  if (origin && isOriginAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

function corsResponse(body: string | null, init: ResponseInit | undefined, origin: string | null): Response {
  const headers = new Headers(init?.headers)
  for (const [k, v] of Object.entries(getCorsHeaders(origin))) {
    headers.set(k, v)
  }
  return new Response(body, { ...init, headers })
}

function getClientIp(req: Request, server: { requestIP: (req: Request) => { address: string } | null }): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || server.requestIP(req)?.address
    || 'unknown'
}

function sanitizeHandle(raw: string, verified: boolean): string {
  let handle = raw.slice(0, MAX_HANDLE_LENGTH).replace(/[\x00-\x1f]/g, '')
  if (!verified && handle.startsWith('@')) {
    handle = handle.slice(1)
  }
  return handle || 'anon'
}

function sanitizeAvatar(raw: string): string {
  const avatar = raw.slice(0, MAX_AVATAR_LENGTH)
  if (avatar && !avatar.startsWith('https://')) return ''
  return avatar
}

function sanitizeRoomCode(raw: string): string {
  return raw.slice(0, MAX_ROOM_CODE_LENGTH).replace(/[^a-z0-9-]/gi, '')
}

const server = Bun.serve<WsData>({
  port: PORT,

  fetch(req, server) {
    const url = new URL(req.url)
    const origin = req.headers.get('origin')

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: getCorsHeaders(origin) })
    }

    // Health check
    if (url.pathname === '/health') {
      return corsResponse('ok', undefined, origin)
    }

    // Room browser
    if (url.pathname === '/rooms' && req.method === 'GET') {
      return corsResponse(JSON.stringify(roomManager.getRoomsResponse()), {
        headers: { 'Content-Type': 'application/json' },
      }, origin)
    }

    // Stats endpoint
    if (url.pathname === '/stats' && req.method === 'GET') {
      const livePlayers = roomManager.allRooms().reduce(
        (sum, r) => sum + r.realPlayerCount(), 0
      )
      const result: Record<string, unknown> = stats.getPublicStats(livePlayers)
      const statsKey = req.headers.get('x-stats-key')
      if (statsKey && process.env.STATS_API_KEY && statsKey === process.env.STATS_API_KEY) {
        result.health = stats.getHealthStats()
      }
      return corsResponse(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      }, origin)
    }

    // --- Auth routes ---

    // GET /auth/twitter — redirect to X OAuth
    if (url.pathname === '/auth/twitter' && req.method === 'GET') {
      const codeChallenge = url.searchParams.get('code_challenge') || ''
      const state = url.searchParams.get('state') || ''
      if (!state) {
        return corsResponse(JSON.stringify({ error: 'Missing state parameter' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        }, origin)
      }
      const authUrl = getTwitterAuthUrl(codeChallenge, state)
      return new Response(null, {
        status: 302,
        headers: { Location: authUrl, ...getCorsHeaders(origin) },
      })
    }

    // POST /auth/callback — exchange code for token, fetch user, return JWT
    if (url.pathname === '/auth/callback' && req.method === 'POST') {
      const ip = getClientIp(req, server)
      if (!httpLimiter.check(ip)) {
        return corsResponse(JSON.stringify({ error: 'Too many requests' }), {
          status: 429, headers: { 'Content-Type': 'application/json' },
        }, origin)
      }
      return (async () => {
        try {
          const body = await req.json()
          const { code, codeVerifier } = body as { code: string; codeVerifier: string }
          const accessToken = await exchangeCodeForToken(code, codeVerifier)
          let userInfo: import('./auth').UserInfo
          try {
            userInfo = await fetchUserInfo(accessToken)
          } catch {
            const id = Math.random().toString(36).substring(2, 6)
            userInfo = { handle: `@player_${id}`, displayName: `Player ${id}`, avatar: '', bio: '' }
          }
          const jwt = createJWT(userInfo)
          return corsResponse(JSON.stringify({ jwt, user: userInfo }), {
            headers: { 'Content-Type': 'application/json' },
          }, origin)
        } catch (e: any) {
          console.error('Auth callback error:', e.message)
          return corsResponse(JSON.stringify({ error: 'Authentication failed' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }, origin)
        }
      })()
    }

    // --- Share card endpoint ---

    // GET /card/:encoded — render SVG card from base64url-encoded stats
    if (url.pathname.startsWith('/card/')) {
      const encoded = url.pathname.slice(6)
      const decoded = decodeCardPayload(encoded)
      if (!decoded) {
        return corsResponse('Invalid card data', { status: 400 }, origin)
      }
      const svg = generateShareCard(decoded.stats, decoded.roomCode)
      return corsResponse(svg, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=86400',
        },
      }, origin)
    }

    // WebSocket upgrade
    if (url.pathname === '/ws') {
      const ip = getClientIp(req, server)
      if (!wsLimiter.check(ip)) {
        return new Response('Too many connections', { status: 429 })
      }
      const wsOrigin = req.headers.get('origin')
      if (wsOrigin && !isOriginAllowed(wsOrigin)) {
        return new Response('Origin not allowed', { status: 403 })
      }
      const upgraded = server.upgrade(req, {
        data: { playerId: '', roomCode: '', msgCount: 0, msgWindowStart: 0, lastJoinAt: 0 },
      })
      if (upgraded) return undefined
      return new Response('WebSocket upgrade failed', { status: 400 })
    }

    return corsResponse('Not found', { status: 404 }, origin)
  },

  websocket: {
    maxPayloadLength: WS_MAX_PAYLOAD,
    idleTimeout: 120,

    open(ws) {
      stats.onWsOpen()
    },

    message(ws, message) {
      // Per-connection message rate limiting (60 msgs/sec)
      const now = Date.now()
      if (now - ws.data.msgWindowStart > 1000) {
        ws.data.msgCount = 0
        ws.data.msgWindowStart = now
      }
      ws.data.msgCount++
      if (ws.data.msgCount > 60) {
        ws.close(1008, 'Rate limit exceeded')
        return
      }

      let msg: ClientMessage
      try {
        msg = JSON.parse(String(message))
      } catch {
        ws.send(JSON.stringify({ t: 'error', msg: 'Invalid JSON' } satisfies ServerMessage))
        return
      }

      switch (msg.t) {
        case 'join': {
          // Join cooldown: 2 seconds between join attempts
          if (now - ws.data.lastJoinAt < 2000) {
            ws.send(JSON.stringify({ t: 'error', msg: 'Too fast' } satisfies ServerMessage))
            break
          }
          ws.data.lastJoinAt = now

          // Ghost cleanup: remove old player if re-joining
          if (ws.data.playerId) {
            const oldRoom = roomManager.getRoom(ws.data.roomCode)
            if (oldRoom) {
              oldRoom.removePlayer(ws.data.playerId)
              oldRoom.removeSpectator(ws)
            }
          }

          const playerId = generatePlayerId()
          const roomCode = sanitizeRoomCode(msg.room || '')

          // JWT verification
          let verified = false
          let handle: string
          let avatar: string
          if (msg.token) {
            const user = verifyJWT(msg.token)
            if (user) {
              verified = true
              handle = user.handle
              avatar = sanitizeAvatar(user.avatar)
            } else {
              handle = sanitizeHandle(msg.guest || 'anon', false)
              avatar = sanitizeAvatar(msg.avatar || '')
            }
          } else {
            handle = sanitizeHandle(msg.guest || 'anon', false)
            avatar = sanitizeAvatar(msg.avatar || '')
          }

          const room = roomCode
            ? roomManager.getOrCreateRoom(roomCode)
            : roomManager.getPublicRoom()

          if (!room) {
            ws.send(JSON.stringify({ t: 'error', msg: 'Server is at capacity' } satisfies ServerMessage))
            return
          }

          if (room.playerCount() >= ROOM_CAPACITY) {
            ws.send(JSON.stringify({ t: 'error', msg: 'Room is full' } satisfies ServerMessage))
            return
          }

          ws.data.playerId = playerId
          ws.data.roomCode = room.code

          room.addPlayer(playerId, handle, ws, avatar)

          const livePlayers = roomManager.allRooms().reduce(
            (sum, r) => sum + r.realPlayerCount(), 0
          )
          stats.onPlayerJoin(livePlayers)

          roomManager.pushActivity({
            type: 'join',
            text: `${handle} entered the arena`,
            ts: Date.now(),
          })

          const joinedMsg: ServerMessage = {
            t: 'joined',
            room: room.code,
            playerId,
            world: { w: WORLD_W, h: WORLD_H },
          }
          ws.send(JSON.stringify(joinedMsg))
          break
        }

        case 'input': {
          if (typeof msg.x !== 'number' || typeof msg.y !== 'number') return
          if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return
          const room = roomManager.getRoom(ws.data.roomCode)
          if (!room) return
          const player = room.players.get(ws.data.playerId)
          if (!player) return
          player.targetX = Math.max(0, Math.min(WORLD_W, msg.x))
          player.targetY = Math.max(0, Math.min(WORLD_H, msg.y))
          break
        }

        case 'split': {
          const room = roomManager.getRoom(ws.data.roomCode)
          if (!room) return
          const player = room.players.get(ws.data.playerId)
          if (!player) return
          splitPlayer(player, Date.now())
          break
        }

        case 'spectate': {
          // Ghost cleanup
          if (ws.data.playerId) {
            const oldRoom = roomManager.getRoom(ws.data.roomCode)
            if (oldRoom) {
              oldRoom.removePlayer(ws.data.playerId)
              oldRoom.removeSpectator(ws)
            }
          }

          const roomCode = sanitizeRoomCode(msg.room || '')
          const room = roomCode
            ? (roomManager.getRoom(roomCode) || roomManager.getPublicRoom())
            : roomManager.getPublicRoom()

          if (!room) {
            ws.send(JSON.stringify({ t: 'error', msg: 'Server is at capacity' } satisfies ServerMessage))
            return
          }

          ws.data.playerId = ''
          ws.data.roomCode = room.code
          room.addSpectator(ws)

          const joinedMsg: ServerMessage = {
            t: 'joined',
            room: room.code,
            playerId: '',
            world: { w: WORLD_W, h: WORLD_H },
          }
          ws.send(JSON.stringify(joinedMsg))
          break
        }

        case 'eject': {
          // Stub for now
          break
        }
      }
    },

    close(ws) {
      stats.onWsClose()
      const room = roomManager.getRoom(ws.data.roomCode)
      if (room) {
        const player = room.players.get(ws.data.playerId)
        if (player) {
          stats.onPlayerDisconnect(Date.now() - player.joinedAt, player.handle)
        }
        room.removePlayer(ws.data.playerId)
        room.removeSpectator(ws)
      }
    },
  },
})

// Start simulation
simulation.start()

// Room cleanup every 30s
setInterval(() => {
  roomManager.cleanup()
}, 30_000)

console.log(`pretext arena server running on :${server.port}`)
