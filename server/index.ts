import { WORLD_W, WORLD_H } from '../shared/constants'
import type { ClientMessage, ServerMessage } from '../shared/protocol'
import { RoomManager } from './room'
import type { WsData } from './room'
import { Simulation } from './simulation'
import {
  exchangeCodeForToken, fetchUserInfo, createJWT,
  getTwitterAuthUrl,
} from './auth'
import { generateShareCard, storeCard, getCard } from './cards'

const PORT = Number(process.env.PORT) || 3001

const roomManager = new RoomManager()
const simulation = new Simulation(roomManager)

function generatePlayerId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function corsResponse(body: string | null, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers)
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    headers.set(k, v)
  }
  return new Response(body, { ...init, headers })
}

const server = Bun.serve<WsData>({
  port: PORT,

  fetch(req, server) {
    const url = new URL(req.url)

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS })
    }

    // Health check
    if (url.pathname === '/health') {
      return corsResponse('ok')
    }

    // --- Auth routes ---

    // GET /auth/twitter — redirect to X OAuth
    if (url.pathname === '/auth/twitter' && req.method === 'GET') {
      const codeChallenge = url.searchParams.get('code_challenge') || ''
      const authUrl = getTwitterAuthUrl(codeChallenge)
      return new Response(null, {
        status: 302,
        headers: { Location: authUrl, ...CORS_HEADERS },
      })
    }

    // POST /auth/callback — exchange code for token, fetch user, return JWT
    if (url.pathname === '/auth/callback' && req.method === 'POST') {
      return (async () => {
        try {
          const body = await req.json()
          const { code, codeVerifier } = body as { code: string; codeVerifier: string }
          const accessToken = await exchangeCodeForToken(code, codeVerifier)
          const userInfo = await fetchUserInfo(accessToken)
          const jwt = createJWT(userInfo)
          return corsResponse(JSON.stringify({ jwt, user: userInfo }), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (e: any) {
          return corsResponse(JSON.stringify({ error: e.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      })()
    }

    // --- Share card endpoint ---

    // GET /card/:id — serve SVG share card
    if (url.pathname.startsWith('/card/')) {
      const id = url.pathname.slice(6)
      const svg = getCard(id)
      if (!svg) {
        return corsResponse('Not found', { status: 404 })
      }
      return corsResponse(svg, {
        headers: { 'Content-Type': 'image/svg+xml' },
      })
    }

    // POST /card — generate and store a share card
    if (url.pathname === '/card' && req.method === 'POST') {
      return (async () => {
        try {
          const body = await req.json()
          const { stats, roomCode } = body as { stats: any; roomCode: string }
          const svg = generateShareCard(stats, roomCode)
          const cardId = storeCard(svg)
          const cardUrl = `${url.origin}/card/${cardId}`
          return corsResponse(JSON.stringify({ cardId, cardUrl }), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (e: any) {
          return corsResponse(JSON.stringify({ error: e.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      })()
    }

    // WebSocket upgrade
    if (url.pathname === '/ws') {
      const upgraded = server.upgrade(req, {
        data: { playerId: '', roomCode: '' },
      })
      if (upgraded) return undefined
      return new Response('WebSocket upgrade failed', { status: 400 })
    }

    return corsResponse('Not found', { status: 404 })
  },

  websocket: {
    open(ws) {
      // Connection opened, wait for join message
    },

    message(ws, message) {
      let msg: ClientMessage
      try {
        msg = JSON.parse(String(message))
      } catch {
        ws.send(JSON.stringify({ t: 'error', msg: 'Invalid JSON' } satisfies ServerMessage))
        return
      }

      switch (msg.t) {
        case 'join': {
          const playerId = generatePlayerId()
          const roomCode = msg.room || ''
          const handle = msg.guest || '@anon'

          const room = roomCode
            ? roomManager.getOrCreateRoom(roomCode)
            : roomManager.getPublicRoom()

          ws.data.playerId = playerId
          ws.data.roomCode = room.code

          room.addPlayer(playerId, handle, ws)

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
          const room = roomManager.getRoom(ws.data.roomCode)
          if (!room) return
          const player = room.players.get(ws.data.playerId)
          if (!player) return
          player.targetX = msg.x
          player.targetY = msg.y
          break
        }

        case 'split': {
          // Stub for now
          break
        }

        case 'eject': {
          // Stub for now
          break
        }
      }
    },

    close(ws) {
      const room = roomManager.getRoom(ws.data.roomCode)
      if (room) {
        room.removePlayer(ws.data.playerId)
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

console.log(`pretext server running on :${server.port}`)
