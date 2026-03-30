import { setLocale, clearCache } from '@chenglou/pretext'
import { LandingScreen } from './screens/landing'
import { DeathScreen } from './screens/death'
import { GameScreen } from './screens/game'
import { handleCallback, getStoredUser } from './auth'
import { cursor } from './game/cursor'

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
cursor.init()

// Initialize pretext locale for future i18n / multilingual corpus support
setLocale(navigator.language)

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
  // Flush pretext font/variant caches between screen transitions
  clearCache()
  const landing = new LandingScreen(canvas, SERVER_URL)
  landing.show().then((result) => {
    if (result.action === 'play') {
      startGame(result.handle, result.token, result.room, result.avatar)
    } else if (result.action === 'spectate') {
      startSpectate(result.room)
    }
  })
}

function startSpectate(room?: string) {
  const game = new GameScreen(canvas, 'spectator', {
    mode: 'online',
    serverUrl: `${SERVER_URL}/ws`,
    roomCode: room || null,
    token: undefined,
    spectate: true,
  })

  game.setOnDeath(async () => {
    showLanding()
  })

  game.start()
}

function startGame(handle: string, token?: string, room?: string, avatar?: string) {
  const game = new GameScreen(canvas, handle, {
    mode: 'online',
    serverUrl: `${SERVER_URL}/ws`,
    roomCode: room || null,
    token,
    avatar,
  })

  game.setOnDeath(async (stats) => {
    // Flush pretext caches — game corpus text is no longer needed
    clearCache()
    const death = new DeathScreen(canvas)
    const action = await death.show(stats, game.roomCode || 'PUBLIC', `${SERVER_URL}/ws`)
    if (action === 'play') {
      startGame(handle, token, room, avatar)
    } else {
      showLanding()
    }
  })

  game.start()
}

main()
