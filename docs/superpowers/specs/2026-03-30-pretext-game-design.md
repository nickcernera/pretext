# Pretext — Real-Time Multiplayer Text Arena

> Viral browser game where you ARE your X handle. Eat smaller players, absorb their text, grow your blob. Built on the [pretext](https://github.com/chenglou/pretext) library for real-time text reflow.

**Goal:** Build a following and brand (AI/frontier tech + creative coding) through a viral, shareable multiplayer experience. No monetization — optional Ko-fi/Buy Me a Coffee link.

---

## Core Game Loop

1. Sign in with X (or play as guest with random handle)
2. Join a room via link (`pretext.io/r/ABC`) or quick-play (random public room)
3. Move with mouse/touch. Eat floating text pellets to grow. Eat smaller players.
4. Your blob's text reflows in real-time as you grow/shrink/move (pretext `layoutNextLine()`)
5. When you eat a player, their `@handle` visibly flows into your blob
6. Every 10 minutes, leaderboard snapshot → #1 gets a shareable card
7. Die → death screen with stats + "Share on X" button + instant rejoin

## Mechanics

- **Bigger eats smaller** — mass = accumulated character count
- **Speed/size tradeoff** — bigger = slower, small = fast and nimble
- **Split** — divide blob (and text) into two halves, offensive move to catch smaller players
- **Eject mass** — shoot a word from your blob, used to bait or feed allies
- **Mass decay** — gradual shrinkage over time prevents runaway leaders
- **Pellets** — floating text fragments around the arena, eaten for small mass gains

## Rooms

- **Persistent** — room link always works, players drop in/out freely, no round timer
- **Public rooms** — pool of 3-5 always-warm rooms, auto-assigned on quick-play
- **Private rooms** — created on demand, 4-char alphanumeric code (`pretext.io/r/ABCD`)
- **Capacity** — 30 players max, bot backfill when <8 real players
- **Lifecycle** — rooms spin down after 5 minutes with 0 players
- **Leaderboard snapshots** — every 10 minutes, #1 player prompted to share

---

## Visual Identity

### Fonts
- **Space Grotesk** — display, blob text, headings (geometric, techy, distinctive)
- **Space Mono** — leaderboard, kill feed, rain, UI data (monospace companion)

### Background
- DIY grainy gradient: deep green + blue radial gradients on near-black (`#050a08`)
- SVG `feTurbulence` noise overlay (or canvas noise) — no external dependencies
- Three-layer matrix rain at different opacities

### Matrix Rain (Background Text)
Four content layers, fading in as player data accumulates:

1. **Seed text (always present)** — tech/AI vocabulary + system-style fragments. `"transformer"`, `"attention"`, `"0x7fff"`, `"latency:0.09ms"`, `"gradient∇"`. Solves cold-start — game feels alive from first player.
2. **Player handles** — `@handle` of everyone currently in the room. Brightest layer. Creates "my name is in the Matrix" screenshot moment.
3. **Player bios** — pulled from X auth (free, no API calls). Appear occasionally at medium opacity.
4. **Kill events** — `"@nick devoured @victim"`. Flash through larger/brighter, then fade. Most dramatic layer.

As real player data increases, seed text naturally fades into the background.

### Player Blobs
- Subtle colored glow unique per player (color hashed from handle)
- Text color matches glow tint — soft greens, blues, teals
- 1px border with low-opacity color matched to glow
- Text reflows inside blob shape using pretext `layoutNextLine()` every frame

### UI Chrome
- **Leaderboard** — top-right, Space Mono, green tint, low opacity until hovered
- **Kill feed** — bottom-left, events fade in/out
- **Room code** — top-left, small, click to copy
- **Your stats** — bottom-right, mass + kill count, minimal

---

## Technical Architecture

### Client (Browser)
- **Canvas-rendered** — no DOM for game elements
- pretext `prepareWithSegments()` on player join/text change
- pretext `layoutNextLine()` every frame for blob text reflow
- Client-side prediction for movement, server-authoritative for collisions/eating
- Input: mouse position (desktop), touch position (mobile)
- Render pipeline: background gradient + grain → matrix rain → pellets → player blobs → UI overlay
- WebSocket connection to game server

### Game Server
- **Bun** with native WebSocket support
- Authoritative game state: positions, masses, collisions, eating
- **Tick rate:** 30hz simulation, client interpolates between ticks
- **Spatial partitioning:** grid-based for efficient collision detection
- **Room management:** rooms in-memory, created on demand, destroyed after 5min empty
- **Bot backfill:** simple AI players with generated handles when <8 real players in room

### State Flow
```
Client input (mouse pos) → WebSocket → Server
Server tick (30hz): move players → check collisions → resolve eats → broadcast state delta
Client: interpolate positions → run pretext layout → render frame
```

### Auth
- **X OAuth 2.0** (PKCE flow) — returns handle, display name, avatar URL, bio
- Session stored in HTTP-only cookie (JWT)
- **Guest play** — random generated handle, lowers barrier. Upsell: "sign in with X to save stats and appear in the rain"

### Web Layer
- Lightweight static/Vite landing page
- Landing page: animated preview, "Play Now" CTA, sign in with X
- Share card generation: server-side canvas render to PNG at `/card/:id`
- OG meta tags for rich X embeds

### Data (Minimal — No Database at Launch)
- Player sessions: in-memory on game server
- Leaderboard snapshots: JSON to Vercel Blob
- Share cards: PNG to Vercel Blob
- No persistent user accounts or historical stats for v1

### Deployment
- **Game server:** Bun process on Fly.io or Railway (needs persistent WebSocket connections)
- **Web layer:** Vercel (landing page, auth routes, share card endpoints)
- **Single region** to start (US East), expand based on player distribution
- **Domain:** `pretext.io` (or similar — TBD based on availability)

---

## Viral & Share Mechanics

### Share Triggers

1. **Leaderboard snapshot (every 10 min)** — #1 player gets generated share card + prompt. Pre-filled tweet: `"Ruling the arena on pretext.io/r/ABC 👑 come dethrone me"` + card image.

2. **Death screen** — Stats: time alive, players eaten, peak mass, victims list. Pre-filled: `"Just devoured 12 players on pretext.io before @killer got me 💀"` — tags the killer.

3. **Big kill notification** — Eating a player with 5+ kills. Pre-filled: `"Ate @bigplayer and absorbed 8 souls on pretext.io 🕳️"`.

4. **Room invite** — "Challenge on X" button: `"Who can eat me? pretext.io/r/ABC 🎯"`. Primary organic growth vector.

### Share Card
- **Dimensions:** 1200x675 (X card spec)
- Grainy gradient background matching game aesthetic
- Your `@handle` large in Space Grotesk
- Stats row: `12 kills · 4m32s alive · peak mass: 847`
- Victims ticker: `devoured @a @b @c @d...`
- Footer: `pretext.io` + room code
- Your X avatar (from auth)

### Viral Loops
- **Victim tagging** — shares tag killed/killer, creates reply chains X's algorithm promotes
- **Room links** — `pretext.io/r/ABC` is short, clickable. Friends play → share → their followers see it
- **Emergent drama** — leaderboard shows X handles, people will @ each other organically
- **Visual spectacle** — flowing text blobs on grainy Matrix background is inherently screenshot/screen-record worthy

### Cold-Start Strategy
- Seed public rooms with bots using plausible-sounding handles
- Nick plays live, posts clips — existing network is the initial spark
- Room link in X bio: `"eat me → pretext.io/r/NICK"`
- Game is fun with 2 real players + bots, no critical mass needed

### Donations
- Ko-fi or Buy Me a Coffee link on death screen and landing page
- Small, unobtrusive: `"Enjoying pretext? ☕"`
- Not in-game, not blocking

---

## OG / Meta Tags

- `pretext.io` → static screenshot or animated preview of gameplay
- `pretext.io/r/ABC` → "Join the arena — X players fighting now" + live player count
- Share card URLs → card image as OG image for rich embeds

---

## Out of Scope (v1)

- Persistent user accounts / historical stats
- Multiple game modes / power-ups
- Mobile native app
- Multi-region game servers
- Spectator mode
- Team/clan system
- Chat / emotes
- Custom skins / cosmetics
- Monetization beyond donations
