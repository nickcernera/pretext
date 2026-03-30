import { LandingScreen } from './screens/landing'
import { DeathScreen } from './screens/death'
import { GameScreen } from './screens/game'
import { handleCallback, getStoredUser } from './auth'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'ws://localhost:3001'

function resize() {
  const dpr = window.devicePixelRatio || 1
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  canvas.style.width = window.innerWidth + 'px'
  canvas.style.height = window.innerHeight + 'px'
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

resize()
window.addEventListener('resize', resize)

async function main() {
  // Handle OAuth callback
  const params = new URLSearchParams(window.location.search)
  if (params.has('code')) {
    try {
      await handleCallback(params.get('code')!)
    } catch (e) {
      console.error('OAuth callback failed:', e)
    }
    window.history.replaceState({}, '', '/')
  }

  showLanding()
}

function showLanding() {
  const landing = new LandingScreen(canvas)
  landing.show().then((result) => {
    if (result.action === 'play') {
      startGame(result.handle, result.token, result.room)
    }
  })
}

function startGame(handle: string, token?: string, room?: string) {
  const game = new GameScreen(canvas, handle, {
    mode: 'online',
    serverUrl: `${SERVER_URL}/ws`,
    roomCode: room || null,
    token,
  })

  game.setOnDeath(async (stats) => {
    const death = new DeathScreen(canvas)
    const action = await death.show(stats, game.roomCode || 'PUBLIC')
    if (action === 'play') {
      startGame(handle, token, room)
    } else {
      showLanding()
    }
  })

  game.start()
}

main()
