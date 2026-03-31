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
