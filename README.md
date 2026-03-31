# Pretext Arena

Multiplayer browser game where you ARE your text. Sign in with X, eat word pellets, eat other players, absorb their handles. Built with [@chenglou/pretext](https://github.com/chenglou/pretext).

Built in 2 days. 100% Claude Code. 0 lines written by hand.

<!-- TODO: add gameplay GIF here -->
<!-- ![gameplay](./assets/gameplay.gif) -->

**[Play now at pretextarena.io](https://pretextarena.io)**

## Stack

- **Rendering**: [@chenglou/pretext](https://github.com/chenglou/pretext) for real-time text layout on canvas
- **Client**: Vite + TypeScript, canvas-based rendering
- **Server**: Bun WebSocket server, authoritative physics at 30 ticks/sec
- **Deploy**: [Fly.io](https://fly.io) (game server) + [Vercel](https://vercel.com) (static client)
- **Auth**: X/Twitter OAuth with PKCE
- **Video**: Launch video rendered by the game engine via [Remotion](https://remotion.dev)

## How it works

Text is the game mechanic, not a label on a sprite. Every blob is real text rendered by pretext. The more you eat, the more text you carry. Eat another player and their handle becomes part of you.

## Run locally

```bash
# Install dependencies
bun install

# Run both in separate terminals
bun run dev           # Vite client on :5173
bun run dev:server    # Bun game server on :3001

# Build for production
bun run build

# Run tests
bun test server/__tests__
```

Copy `.env.example` to `.env` and fill in your Twitter API credentials for auth.

## Architecture

```
src/
  main.ts              — Entry point, screen router (Landing → Game → Death)
  screens/             — Landing, Game, Death screen classes
  game/                — Renderer, Camera, Input, HUD, Blob drawing, Rain, Pellets
  net/                 — WebSocket client + state interpolation
  auth.ts              — X/Twitter OAuth (PKCE flow)
server/
  index.ts             — Bun.serve with HTTP routes + WebSocket handler
  simulation.ts        — Game loop (physics, eating, broadcasting)
  room.ts              — Room + RoomManager (capacity, pellets, leaderboard)
  bot.ts               — Bot AI (wander, flee, chase)
  spatial.ts           — Spatial hash grid for collision detection
shared/
  protocol.ts          — Message types, PlayerState, helpers
  constants.ts         — All game tuning constants
video/
  src/                 — Remotion composition (launch video rendered by game engine)
```

## License

MIT
