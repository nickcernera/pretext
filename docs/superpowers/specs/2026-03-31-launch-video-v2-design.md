# Launch Video V2 — Real Gameplay + Homepage Intro

## Overview

Redesign the Remotion launch video to feature a homepage intro mirroring the real landing page, three scripted gameplay acts with escalating stakes, and a CTA. The video uses the actual game renderer and simulation engine.

**Format:** 1920x1080 @ 30fps, 480 frames (16s)

## Timeline

| Frames | Time | Scene | Description |
|--------|------|-------|-------------|
| 0–105 | 0–3.5s | **Homepage Intro** | Text sea bg (Pretext-rendered), "pretext arena" title (64px Space Grotesk), tagline "you are your text. eat or be eaten.", "powered by @chenglou/pretext" attribution, animated cursor moves to "Quick Play" button and clicks |
| 105–108 | 3.5–3.6s | **Flash Cut** | 2-3 frame green (#00ff41) flash |
| 108–210 | 3.6–7s | **Act 1: The Spawn** | Small `@cerneradesign` (mass ~100), tight camera, dense pellets nearby. Eat words, grow visibly. Text sea flowing around blob. |
| 210–213 | 7–7.1s | **Flash Cut** | Green flash |
| 213–315 | 7.1–10.5s | **Act 2: The Hunt** | Medium `@cerneradesign` (mass ~300). Large `@kernelpanic` (mass ~500) chasing. Near-miss, eat pellets frantically, grow enough to turn tables. Absorb `@kernelpanic`. Screen shake. |
| 315–318 | 10.5–10.6s | **Flash Cut** | Green flash |
| 318–420 | 10.6–14s | **Act 3: The Domination** | Huge `@cerneradesign` (mass ~800+), words + victim handles inside. 2-3 small bots clustered ahead. Speed ramp: slow to 50% as player presses space to split, hold ~0.5s, snap to 1x as split pieces devour bots. Screen shake on each absorb. |
| 420–480 | 14–16s | **CTA** | Dark overlay fades in. "PLAY NOW" (100px Space Grotesk, pulsing green glow) + "pretextarena.io" (32px Space Mono). Gameplay continues underneath. |

## Scene Details

### Homepage Intro (0–3.5s)

Recreate a simplified version of the real landing page in Remotion React components:

**Elements (layered):**
- **Background**: Text sea — the same word-flow effect from the landing page. Rendered using `@chenglou/pretext` layout with the game's `SEA_WORDS` corpus at 12px Space Mono, ~22% opacity on `#00ff41`. No cursor spotlight needed (the animated cursor provides focus).
- **Center panel** (no visible border, just centered content):
  - "pretext arena" — 64px Space Grotesk bold, color `#d0ffe0`
  - "you are your text. eat or be eaten." — 14px Space Mono, color `#4a7a5a`
  - "powered by @chenglou/pretext" — 12px Space Mono, color `#4a7a5a`, slightly dimmer
  - "Quick Play" button — 14px Space Mono, border `#00ff41`, bg `#1a2a1a`, text `#00ff41`
- **Animated cursor**: A small green dot/arrow that fades in around frame 30, moves toward "Quick Play" with a natural ease-out curve, clicks at ~frame 90. On click: button flashes bright (brief color invert or glow), then flash-cut to gameplay.

**Fonts:** Use `@remotion/google-fonts` for Space Grotesk and Space Mono (already loaded in `fonts.ts`).

### Three Gameplay Acts

Each act is a **separate GameCanvas** with its own `Simulation` instance configured with different initial conditions. This gives full creative control over each scenario.

**Shared across acts:**
- Player handle: `@cerneradesign`
- Full game renderer (background, text sea, grid, pellets, blobs)
- Scanline overlay at 3% opacity (horizontal lines every 3-4px)

**Act 1: The Spawn**
- Player: mass 100, position center-ish (2000, 2000)
- Pellets: dense cluster near player (spawn 30+ within 400px radius)
- Bots: 3-4 bots spawned far away (>1000px), small mass (80-150). They wander, don't engage.
- Waypoints: gentle curve through the pellet cluster. Player eats 10-15 pellets over 3.4s.
- Camera: tight zoom (player is small = high zoom factor). Text sea detail very visible.

**Act 2: The Hunt**
- Player: mass 300, position (1500, 2000)
- `@kernelpanic`: mass 500, spawned ~600px away, AI set to chase player
- 2-3 other small bots wandering
- Dense pellet cluster on the player's escape route
- Waypoints: player moves AWAY from @kernelpanic initially (flee path), curves through pellets, gains mass, then the simulation naturally flips (player mass > kernelpanic * EAT_RATIO) and player turns back to absorb.
- Scripted moment: at the absorption frame, trigger screen shake on camera.

**Act 3: The Domination**
- Player: mass 800, position (1800, 2000). Already has victim text: "@cerneradesign @kernelpanic async void malloc"
- 3 small bots clustered at (2400, 2000), mass 100-150 each
- Waypoints: player moves toward the cluster
- **Split mechanic**: At a scripted frame (when player is ~300px from cluster), trigger split. Player cell divides into two halves, one shoots toward the bots at `SPLIT_VELOCITY`.
- **Speed ramp**: 8 frames before split = normal speed. On split frame: playback slows to 50% (render each sim frame twice). Hold slow-mo for ~15 frames (0.5s real time), then snap back to 1x.
- Each bot absorption triggers screen shake.
- After split pieces merge back, player is massive with all victim handles inside.

### Flash Cuts

Between each scene transition: 2-3 frames of solid `#00ff41` (full bright green), then immediate cut to next scene. These are simple `<Sequence>` elements with a green `<AbsoluteFill>`.

### Scanline Overlay

A constant full-duration overlay rendered as a React component:
- Horizontal lines every 4px, 1px tall, black at 3% opacity
- Optionally: very subtle vertical hold flicker (opacity varies 2-4% on a slow sine wave)
- Rendered as a single absolutely-positioned div with a repeating CSS linear-gradient (since this is static styling, not animation — the gradient itself doesn't change, only the container opacity might pulse slightly).

Wait — Remotion forbids CSS animations. The slight opacity pulse would need to be driven by `useCurrentFrame()` + `interpolate()`. Fine — just interpolate the overlay opacity between 0.02 and 0.04 on a slow cycle.

### CTA (14–16s)

Same as current implementation but over the Act 3 gameplay (which continues playing underneath):
- Dark overlay fades in: `rgba(5, 10, 8, 0.5)`
- "PLAY NOW" — 100px Space Grotesk bold, `#00ff41`, pulsing glow shadow
- "pretextarena.io" — 32px Space Mono, `rgba(0, 255, 65, 0.7)`

### Speed Ramp Implementation

The speed ramp in Act 3 is achieved at the composition level, not the simulation level:
- The Act 3 `GameCanvas` renders simulation frames 1:1 normally
- During the slow-mo window: the Remotion composition maps 2 real frames to each simulation frame (effectively repeating each sim frame twice in the video timeline)
- This means the Act 3 `GameCanvas` needs a `frameMap` prop or similar that translates video frame → simulation frame, allowing non-linear time mapping

Alternative (simpler): Run the simulation at half `dt` during the slow-mo window. Instead of `dt = 1/30`, use `dt = 1/60` for those frames. The physics runs at half speed while the renderer still draws every frame. This is simpler — just modify the `step(dt)` call.

**Recommended: the simpler approach** — pass a `speedMultiplier` to the simulation step. Default 1.0, set to 0.5 during the slow-mo window.

## Simulation Changes

### Split Mechanic

Add to `Simulation.ts`:
- `triggerSplit(frame)`: At the specified frame, split the player's largest cell. Half mass stays, half mass launches toward the nearest bot cluster at `SPLIT_VELOCITY`.
- Split cells decelerate per `SPLIT_DECEL` constant
- After `MERGE_TIME` ms (converted to frames), cells merge back
- Port logic from `GameScreen.splitLocalPlayer()` — ~30 lines

### Scripted Events

Add a `ScriptedEvent` system:
```ts
type ScriptedEvent =
  | { frame: number; type: 'split' }
  | { frame: number; type: 'shake' }
```

The simulation checks for events each step and triggers them.

### Per-Act Configuration

Instead of one Simulation seed + waypoints, each act gets its own config:

```ts
type ActConfig = {
  seed: number;
  playerHandle: string;
  playerMass: number;
  playerStart: { x: number; y: number };
  playerTexts?: string; // pre-existing text inside blob
  waypoints: Waypoint[];
  bots: BotConfig[];
  pelletDensity?: { center: {x: number, y: number}; radius: number; count: number };
  events: ScriptedEvent[];
}
```

## Component Architecture

```
LaunchVideo.tsx (master composition, 480 frames)
├── ScanlineOverlay.tsx (full duration, 3% opacity horizontal lines)
├── Sequence: Homepage Intro (frames 0–105)
│   ├── HomepageSea.tsx (text sea background using Pretext layout)
│   ├── HomepagePanel.tsx (title, tagline, attribution, button)
│   └── AnimatedCursor.tsx (green dot, eased movement, click flash)
├── Sequence: Flash Cut (frames 105–108)
│   └── GreenFlash.tsx
├── Sequence: Act 1 (frames 108–210)
│   └── GameCanvas.tsx (actConfig for spawn scenario)
├── Sequence: Flash Cut (frames 210–213)
├── Sequence: Act 2 (frames 213–315)
│   └── GameCanvas.tsx (actConfig for hunt scenario)
├── Sequence: Flash Cut (frames 315–318)
├── Sequence: Act 3 (frames 318–420)
│   └── GameCanvas.tsx (actConfig for domination scenario, speedMultiplier)
├── Sequence: CTA (frames 420–480)
│   └── CallToAction.tsx (over Act 3 gameplay continuing)
```

## New Files

| File | Purpose |
|------|---------|
| `video/src/HomepageSea.tsx` | Text sea background using Pretext layout engine |
| `video/src/HomepagePanel.tsx` | Landing page title, tagline, attribution, Quick Play button |
| `video/src/AnimatedCursor.tsx` | Green cursor dot with eased movement and click animation |
| `video/src/GreenFlash.tsx` | Simple green fill for flash cut transitions |
| `video/src/ScanlineOverlay.tsx` | CRT scanline effect overlay |
| `video/src/ActConfig.ts` | Type definitions + configs for each gameplay act |

## Modified Files

| File | Changes |
|------|---------|
| `video/src/Simulation.ts` | Add split mechanic, scripted events, per-act config (ActConfig), speed multiplier support |
| `video/src/GameCanvas.tsx` | Accept ActConfig prop, pass speed multiplier, handle per-act setup |
| `video/src/LaunchVideo.tsx` | Complete rewrite — new timeline with homepage intro, 3 acts, flash cuts, scanlines, CTA |
| `video/src/Root.tsx` | Update duration to 480 frames |
| `video/src/GlitchTitle.tsx` | Remove (replaced by HomepagePanel) |
| `video/src/Typewriter.tsx` | Keep (may be used for attribution text animation) |

## Out of Scope

- Audio/music (can be added in post-production)
- Mobile-optimized vertical version
- Actual cursor sprite (using a simple green dot)
- Handle input field in homepage (simplified — just title + button)
