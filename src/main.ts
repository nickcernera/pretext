import { GameScreen } from './screens/game'

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

startGame('@nickcernera')

function startGame(handle: string) {
  const game = new GameScreen(canvas, handle, {
    mode: 'online',
    serverUrl: `${SERVER_URL}/ws`,
  })
  game.setOnDeath((stats) => {
    console.log('DIED', stats)
    setTimeout(() => startGame(handle), 2000)
  })
  game.start()
}
