import { useEffect, useMemo, useRef } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Renderer } from "~game/renderer";
import { NoopHUD } from "./NoopHUD";
import { Simulation } from "./Simulation";
import { createRng } from "./seededRandom";
import type { ActConfig } from "./ActConfig";
import type { PlayerState, PelletState } from "@shared/protocol";

/**
 * Temporarily replace Math.random with a seeded PRNG so that
 * the game's rain corpus (which calls Math.random internally)
 * is deterministic across Remotion's parallel render workers.
 */
function withSeededRandom<T>(seed: number, fn: () => T): T {
  const original = Math.random;
  Math.random = createRng(seed);
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

type FrameSnapshot = {
  players: PlayerState[];
  pellets: PelletState[];
  playerTexts: Map<string, string>;
  prevPlayerPos: { x: number; y: number } | null;
};

/**
 * Pre-simulate all frames for an act and cache the results.
 * This runs once per act config and eliminates O(N) re-simulation per frame.
 */
function preSimulate(config: ActConfig, totalFrames: number, fps: number): FrameSnapshot[] {
  const snapshots: FrameSnapshot[] = [];
  const sim = Simulation.fromConfig(config);

  let prevPos: { x: number; y: number } | null = null;

  for (let i = 0; i <= totalFrames; i++) {
    // Capture current state BEFORE stepping (frame 0 = initial state)
    const ps = sim.getPlayers();
    const localP = ps.find((p) => p.id === "player");

    snapshots.push({
      players: ps,
      pellets: [...sim.getPellets()],
      playerTexts: new Map(sim.getPlayerTexts()),
      prevPlayerPos: prevPos,
    });

    // Save current position for next frame's prevPlayerPos
    if (localP) {
      prevPos = { x: localP.x, y: localP.y };
    }

    // Step to next frame
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

  // Pre-simulate all frames once (memoized by config reference)
  const snapshots = useMemo(
    () => preSimulate(config, 120, fps), // 120 frames max per act (~4s at 30fps)
    [config, fps],
  );

  useEffect(() => {
    // Seed Math.random during renderer creation so the rain corpus
    // is identical across Remotion's parallel render workers
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

    if (config.cameraZoom) {
      const zoom = config.cameraZoom;
      const originalFollow = renderer.camera.follow.bind(renderer.camera);
      renderer.camera.follow = (px: number, py: number, pm: number, sw: number, sh: number) => {
        originalFollow(px, py, pm, sw, sh);
        (renderer.camera as any).targetScale = zoom;
      };
      renderer.camera.scale = zoom;
      (renderer.camera as any).targetScale = zoom;
    }

    rendererRef.current = renderer;
  }, [width, height, config]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // O(1) lookup — no simulation work per frame
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

      // Smooth camera
      const CAMERA_SMOOTH = 0.3;
      let camX = localPlayer.x;
      let camY = localPlayer.y;
      if (snap.prevPlayerPos) {
        camX = snap.prevPlayerPos.x + (localPlayer.x - snap.prevPlayerPos.x) * (1 - CAMERA_SMOOTH);
        camY = snap.prevPlayerPos.y + (localPlayer.y - snap.prevPlayerPos.y) * (1 - CAMERA_SMOOTH);
      }

      renderer.camera.x = camX - width / 2;
      renderer.camera.y = camY - height / 2;
      (renderer.camera as any).targetX = renderer.camera.x;
      (renderer.camera as any).targetY = renderer.camera.y;
    }

    const now = (frame / fps) * 1000;
    renderer.draw(ctx, width, height, snap.players, "player", snap.playerTexts, now);
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
