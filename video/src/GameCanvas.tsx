import { useEffect, useRef } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Renderer } from "~game/renderer";
import { NoopHUD } from "./NoopHUD";
import { Simulation } from "./Simulation";
import type { ActConfig } from "./ActConfig";

export const GameCanvas: React.FC<{ config: ActConfig }> = ({ config }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);

  useEffect(() => {
    const renderer = new Renderer();
    (renderer as any).hud = new NoopHUD();
    renderer.init(width, height);
    const handles = [
      config.playerHandle,
      ...config.bots.map((b) => b.handle),
    ];
    renderer.rain.setHandles(handles);

    // Override camera zoom: monkey-patch follow() to preserve our zoom
    if (config.cameraZoom) {
      const zoom = config.cameraZoom;
      const originalFollow = renderer.camera.follow.bind(renderer.camera);
      renderer.camera.follow = (px: number, py: number, pm: number, sw: number, sh: number) => {
        originalFollow(px, py, pm, sw, sh);
        // Override the mass-based zoom with our cinematic zoom
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

    const sim = Simulation.fromConfig(config);
    sim.runToFrame(frame, fps);

    // Also simulate previous frame for camera smoothing
    let prevPlayerX: number | null = null;
    let prevPlayerY: number | null = null;
    if (frame > 0) {
      const prevSim = Simulation.fromConfig(config);
      prevSim.runToFrame(frame - 1, fps);
      const prevPlayer = prevSim.getPlayers().find((p) => p.id === "player");
      if (prevPlayer) {
        prevPlayerX = prevPlayer.x;
        prevPlayerY = prevPlayer.y;
      }
    }

    const players = sim.getPlayers();
    const pellets = sim.getPellets();
    const playerTexts = sim.getPlayerTexts();

    renderer.pellets.setPellets(pellets);
    const localPlayer = players.find((p) => p.id === "player");
    if (localPlayer) {
      renderer.pellets.setLocalCells(
        localPlayer.cells.map((c) => ({
          x: c.x,
          y: c.y,
          radius: Math.sqrt(c.mass / Math.PI) * 4,
        })),
      );

      // Smooth camera: lerp between previous and current COM to avoid
      // jarring jumps when split shifts the center-of-mass
      const CAMERA_SMOOTH = 0.3; // 0 = snap, 1 = fully smoothed (stuck on prev)
      let camX = localPlayer.x;
      let camY = localPlayer.y;
      if (prevPlayerX !== null && prevPlayerY !== null) {
        camX = prevPlayerX + (localPlayer.x - prevPlayerX) * (1 - CAMERA_SMOOTH);
        camY = prevPlayerY + (localPlayer.y - prevPlayerY) * (1 - CAMERA_SMOOTH);
      }

      renderer.camera.x = camX - width / 2;
      renderer.camera.y = camY - height / 2;
      (renderer.camera as any).targetX = renderer.camera.x;
      (renderer.camera as any).targetY = renderer.camera.y;
    }

    const now = (frame / fps) * 1000;
    renderer.draw(ctx, width, height, players, "player", playerTexts, now);
  }, [frame, fps, width, height, config]);

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
