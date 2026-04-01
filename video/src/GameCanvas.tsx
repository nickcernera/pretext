import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Renderer } from "~game/renderer";
import { pruneStaleBlobs, seedBlobPhysics } from "~game/blob";
import { massToRadius } from "@shared/protocol";
import { NoopHUD } from "./NoopHUD";
import { Simulation } from "./Simulation";
import { createRng } from "./seededRandom";
import type { ActConfig } from "./ActConfig";
import type { PlayerState, PelletState } from "@shared/protocol";

// ---------------------------------------------------------------------------
// Determinism helpers — the game renderer uses performance.now(), Math.random(),
// and module-scope Maps that break Remotion's parallel multi-tab rendering.
// We patch all of them during draw so the output is a pure function of frame #.
// ---------------------------------------------------------------------------

/** Temporarily replace Math.random with a seeded PRNG. */
function withSeededRandom<T>(seed: number, fn: () => T): T {
  const original = Math.random;
  Math.random = createRng(seed);
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

/**
 * Patch performance.now AND Math.random during a callback.
 * This ensures blob wobble, camera shake, spasm effects, and rain kill flashes
 * all produce deterministic output keyed to the frame-based timestamp.
 */
function withDeterministicEnv<T>(frameTimeMs: number, seed: number, fn: () => T): T {
  const origPerfNow = performance.now;
  const origRandom = Math.random;
  performance.now = () => frameTimeMs;
  Math.random = createRng(seed);
  try {
    return fn();
  } finally {
    performance.now = origPerfNow;
    Math.random = origRandom;
  }
}

/**
 * Clear module-scope mutable Maps in blob.ts that accumulate state
 * across frames. In Remotion's parallel rendering, frames execute
 * out of order so accumulated physics/cache state is wrong.
 */
function clearBlobState() {
  pruneStaleBlobs(new Set());
}

// ---------------------------------------------------------------------------
// Rain exclusion snapping — quantize blob positions to a grid so the rain
// text sea doesn't reflow every frame from sub-pixel blob movement.
// ---------------------------------------------------------------------------
const RAIN_SNAP_PX = 4;

function snapRainHoles(holes: { x: number; y: number; radius: number }[]) {
  for (const h of holes) {
    h.x = Math.round(h.x / RAIN_SNAP_PX) * RAIN_SNAP_PX;
    h.y = Math.round(h.y / RAIN_SNAP_PX) * RAIN_SNAP_PX;
  }
}

type FrameSnapshot = {
  players: PlayerState[];
  pellets: PelletState[];
  playerTexts: Map<string, string>;
  /** Camera position pre-computed with exponential smoothing (same as real game). */
  cameraX: number;
  cameraY: number;
  /** Previous-frame positions for ALL blobs (keyed by "id:cellId"), used to seed wobble/sloshing. */
  prevBlobPositions: Map<string, { x: number; y: number }>;
  /** Pre-computed sloshing spring offsets — starting state for drawBlob at this frame. */
  blobOffsets: Map<string, { offX: number; offY: number }>;
};

/**
 * Pre-simulate all frames for an act and cache the results.
 * Camera position and text-sloshing offsets are simulated with the same
 * formulas the real game uses, producing smooth multi-frame convergence.
 */
function preSimulate(
  config: ActConfig,
  totalFrames: number,
  fps: number,
  screenW: number,
  screenH: number,
): FrameSnapshot[] {
  const snapshots: FrameSnapshot[] = [];
  const sim = Simulation.fromConfig(config);

  let prevBlobPos = new Map<string, { x: number; y: number }>();
  let blobOffsets = new Map<string, { offX: number; offY: number }>();

  // Camera: tight tracking with minimal smoothing.
  // The game uses `1 - Math.pow(0.004, dt)` ≈ 17%/frame — too laggy for video.
  // That lag creates visible mismatch between smooth camera and player position,
  // making the player blob appear to stutter. 85%/frame keeps the camera
  // practically snapped to the player while still smoothing split-cell COM shifts.
  const dt = 1 / fps;
  const lerpFactor = 0.85;
  let camX = config.playerStart.x - screenW / 2;
  let camY = config.playerStart.y - screenH / 2;

  // Sloshing: spring constant matching blob.ts drawBlob()
  const spring = Math.min(1, 4 * dt);

  for (let i = 0; i <= totalFrames; i++) {
    const ps = sim.getPlayers();
    const localP = ps.find((p) => p.id === "player");

    // Advance camera toward player using exponential lerp
    if (localP) {
      const targetX = localP.x - screenW / 2;
      const targetY = localP.y - screenH / 2;
      camX += (targetX - camX) * lerpFactor;
      camY += (targetY - camY) * lerpFactor;
    }

    // Snapshot stores the STARTING state for this frame:
    // - blobOffsets: sloshing offsets computed up to (but not including) this frame
    //   so drawBlob's spring formula advances them correctly
    snapshots.push({
      players: ps,
      pellets: [...sim.getPellets()],
      playerTexts: new Map(sim.getPlayerTexts()),
      cameraX: camX,
      cameraY: camY,
      prevBlobPositions: new Map(prevBlobPos),
      blobOffsets: new Map(blobOffsets),
    });

    // Compute sloshing offsets for the NEXT frame (result of this frame's spring step)
    const nextOffsets = new Map<string, { offX: number; offY: number }>();
    for (const p of ps) {
      for (const c of p.cells) {
        const key = `${p.id}:${c.cellId}`;
        const prev = prevBlobPos.get(key);
        const currOff = blobOffsets.get(key) || { offX: 0, offY: 0 };

        if (prev) {
          const vx = (c.x - prev.x) / dt;
          const vy = (c.y - prev.y) / dt;
          const radius = massToRadius(c.mass);
          const maxOff = radius * 0.12;
          const targetX = Math.max(-maxOff, Math.min(maxOff, -vx * 0.015));
          const targetY = Math.max(-maxOff, Math.min(maxOff, -vy * 0.015));
          nextOffsets.set(key, {
            offX: currOff.offX + (targetX - currOff.offX) * spring,
            offY: currOff.offY + (targetY - currOff.offY) * spring,
          });
        } else {
          nextOffsets.set(key, { offX: 0, offY: 0 });
        }
      }
    }
    blobOffsets = nextOffsets;

    // Capture blob positions for next frame's prev data
    const nextPrevBlob = new Map<string, { x: number; y: number }>();
    for (const p of ps) {
      for (const c of p.cells) {
        nextPrevBlob.set(`${p.id}:${c.cellId}`, { x: c.x, y: c.y });
      }
    }
    prevBlobPos = nextPrevBlob;

    let speedMul = 1;
    if (config.slowMoRange) {
      const [start, end] = config.slowMoRange;
      if (i >= start && i <= end) {
        const t = (i - start) / (end - start);
        speedMul = 0.4 + 0.6 * Math.abs(Math.cos(t * Math.PI));
      }
    }
    sim.step(speedMul / fps);
  }

  return snapshots;
}

export const GameCanvas: React.FC<{ config: ActConfig }> = ({ config }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);

  // Pre-simulate all frames once (memoized by config reference).
  const actFrames = Math.ceil(fps * 3.4) + 10;
  const snapshots = useMemo(
    () => preSimulate(config, actFrames, fps, width, height),
    [config, actFrames, fps, width, height],
  );

  // useLayoutEffect ensures the renderer is created synchronously before
  // the drawing effect runs — both fire before browser paint.
  useLayoutEffect(() => {
    const renderer = withSeededRandom(config.seed, () => {
      const r = new Renderer();
      (r as any).hud = new NoopHUD();
      r.init(width, height);
      const handles = [
        config.playerHandle,
        ...config.bots.map((b) => b.handle),
      ];
      r.rain.setHandles(handles);
      // Force corpus rebuild while Math.random is seeded
      (r.rain as any).update(0.016);
      return r;
    });

    // Bypass renderer's camera smoothing — GameCanvas controls camera
    // from pre-computed snapshots with the same exponential lerp.
    renderer.camera.follow = () => {};
    renderer.camera.update = () => {};

    if (config.cameraZoom) {
      renderer.camera.scale = config.cameraZoom;
      (renderer.camera as any).targetScale = config.cameraZoom;
    }

    // Fix B: Snap rain exclusion zone positions to a grid so sub-pixel
    // blob movement doesn't cascade into full-line text reflow every frame.
    const origSetBlobHoles = renderer.rain.setBlobHoles.bind(renderer.rain);
    renderer.rain.setBlobHoles = (holes: { x: number; y: number; radius: number }[]) => {
      snapRainHoles(holes);
      origSetBlobHoles(holes);
    };

    rendererRef.current = renderer;
  }, [width, height, config]);

  // useLayoutEffect runs BEFORE browser paint — critical for Remotion.
  // useEffect runs AFTER paint, so Remotion would capture stale canvas content,
  // causing the entire scene to stutter (some frames show previous frame's draw).
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const snap = snapshots[Math.min(frame, snapshots.length - 1)];

    renderer.pellets.setPellets(snap.pellets);
    const localPlayer = snap.players.find((p) => p.id === "player");
    if (localPlayer) {
      renderer.pellets.setLocalCells(
        localPlayer.cells.map((c) => ({
          x: c.x,
          y: c.y,
          radius: Math.sqrt(c.mass / Math.PI) * 4,
        })),
      );
    }

    // Use pre-computed camera position (exponential lerp across all frames)
    renderer.camera.x = snap.cameraX;
    renderer.camera.y = snap.cameraY;

    // Frame-based timestamp (deterministic, not wall-clock)
    const now = (frame / fps) * 1000;

    // Set lastTime so renderer computes dt = 1/fps (not a huge jump)
    (renderer as any).lastTime = now - (1000 / fps);

    // Clear stale blob state, then seed with pre-computed positions AND
    // sloshing offsets so the spring continues smoothly across frames.
    clearBlobState();
    const seeds: { blobId: string; prevX: number; prevY: number; offX: number; offY: number }[] = [];
    for (const [blobId, pos] of snap.prevBlobPositions) {
      const off = snap.blobOffsets.get(blobId);
      seeds.push({
        blobId,
        prevX: pos.x,
        prevY: pos.y,
        offX: off?.offX ?? 0,
        offY: off?.offY ?? 0,
      });
    }
    seedBlobPhysics(seeds);

    // Freeze performance.now() and seed Math.random during the draw call
    withDeterministicEnv(now, config.seed + frame, () => {
      renderer.draw(ctx, width, height, snap.players, "player", snap.playerTexts, now);
    });

  }, [frame, fps, width, height, config, snapshots]);

  return (
    <AbsoluteFill>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ width: "100%", height: "100%" }}
      />
    </AbsoluteFill>
  );
};
