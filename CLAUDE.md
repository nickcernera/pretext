# Pretext

Multiplayer agar.io-style browser game where players are text blobs. Eat word pellets and other players, absorb their handles. Matrix-rain terminal aesthetic.

## Stack

- **Client**: Vite + TypeScript, canvas-based rendering, `@chenglou/pretext` for text layout
- **Server**: Bun WebSocket server with authoritative physics at 30 ticks/sec
- **Shared**: `shared/` — protocol types + game constants (imported via `@shared` alias)
- **Deploy**: Fly.io (server, `fly.toml`) + Vercel (static client, `vercel.json`)

## Commands

```bash
bun run dev           # Vite dev server (client) on :5173
bun run dev:server    # Bun game server on :3001 (with --watch)
bun run build         # Vite production build → dist/
bun test server/__tests__  # Server tests
```

Run both `dev` and `dev:server` together for local development. Client connects to `VITE_SERVER_URL` (defaults to `ws://localhost:3001`).

## Architecture

```
src/
  main.ts              — Entry point, screen router (Landing → Game → Death)
  screens/             — Landing, Game, Death screen classes
  game/                — Renderer, Camera, Input, HUD, Blob drawing, Rain, Pellets, Background
  net/                 — WebSocket client + state interpolation
  auth.ts              — X/Twitter OAuth (PKCE flow)
  share.ts             — X share intent URL builder
server/
  index.ts             — Bun.serve with HTTP routes + WebSocket handler
  simulation.ts        — Server-side game loop (physics, eating, broadcasting)
  room.ts              — Room + RoomManager (capacity, pellets, leaderboard)
  bot.ts               — Bot AI (wander, flee, chase)
  spatial.ts           — Spatial hash grid for collision detection
  auth.ts              — Twitter OAuth token exchange + JWT
  cards.ts             — SVG share card generation
shared/
  protocol.ts          — Message types, PlayerState, helpers (handleToColor, massToRadius)
  constants.ts         — All game tuning constants (world size, physics, eating, visuals)
```

## Key Patterns

- **Screen router**: Each screen is a class with `show()` returning a Promise. Screens own their DOM overlay + canvas animation loop.
- **Dual mode**: GameScreen runs in `local` (client-side sim with bots) or `online` (server-authoritative) mode.
- **Text as identity**: Blobs display their handle + all eaten words via `@chenglou/pretext` layout. `playerTexts` map tracks accumulated text per player.
- **Protocol**: JSON over WebSocket. Client sends `input` (cursor position) every frame. Server broadcasts `state` (all players + pellets) every tick.
- **Colors**: All derived from handle via `handleToColor()` — deterministic HSL from string hash.

## Conventions

- All game tuning lives in `shared/constants.ts` — don't scatter magic numbers
- HSL color format throughout: `hsl(h, s%, l%)` parsed by blob renderer
- Canvas rendering: background → rain/text-sea → world boundary → pellets → blobs (back-to-front) → HUD
- UI overlays use DOM elements appended to `#ui-root`, not canvas
- Fonts: Space Grotesk (blobs/titles), Space Mono (UI/HUD/code-aesthetic)

## Known Stubs

- `split` and `eject` WebSocket messages are defined in protocol but server handlers are no-ops
- No touch/mobile input beyond basic pointer events
- State broadcast sends full pellet array every tick (needs delta compression for scale)
