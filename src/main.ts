import { GameScreen } from './screens/game'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

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

const game = new GameScreen(canvas, '@nickcernera')
game.setOnDeath((stats) => {
  console.log('DIED', stats)
  setTimeout(() => {
    const g2 = new GameScreen(canvas, '@nickcernera')
    g2.setOnDeath(game.onDeath)
    g2.start()
  }, 2000)
})
game.start()
