import { WORLD_W, WORLD_H } from '../shared/constants'
import type { ClientMessage, ServerMessage } from '../shared/protocol'
import { RoomManager } from './room'
import type { WsData } from './room'
import { Simulation } from './simulation'

const PORT = Number(process.env.PORT) || 3001

const roomManager = new RoomManager()
const simulation = new Simulation(roomManager)

function generatePlayerId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`
}

const server = Bun.serve<WsData>({
  port: PORT,

  fetch(req, server) {
    const url = new URL(req.url)

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response('ok', {
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }

    // WebSocket upgrade
    if (url.pathname === '/ws') {
      const upgraded = server.upgrade(req, {
        data: { playerId: '', roomCode: '' },
      })
      if (upgraded) return undefined
      return new Response('WebSocket upgrade failed', { status: 400 })
    }

    return new Response('Not found', { status: 404 })
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
