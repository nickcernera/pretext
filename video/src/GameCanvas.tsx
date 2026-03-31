import { useEffect, useRef } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Renderer } from "@game/renderer";
import { NoopHUD } from "./NoopHUD";
import { Simulation } from "./Simulation";

const SEED = 42;

/**
 * Player path: a scenic route through the world that passes near pellets
 * and bots. Coordinates are world-space (0–4000).
 */
const WAYPOINTS = [
  { x: 1800, y: 1800 },
  { x: 2200, y: 1600 },
  { x: 2600, y: 1800 },
  { x: 2800, y: 2200 },
  { x: 2400, y: 2600 },
  { x: 2000, y: 2400 },
  { x: 1600, y: 2000 },
  { x: 1800, y: 1800 },
];

export const GameCanvas: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);

  // Initialize renderer once
  useEffect(() => {
    const renderer = new Renderer();
    // Replace HUD with noop to avoid DOM side effects
    (renderer as any).hud = new NoopHUD();
    renderer.init(width, height);
    // Set handles for rain corpus
    const handles = [
      "@you",
      ...["@synthwave", "@tensorcat", "@pixeldrift", "@neuralnet",
        "@bitshift", "@zeroday", "@kernelpanic", "@darkmode",
        "@overfit", "@gradientdrop", "@quantum_bit", "@nullpointer"],
    ];
    renderer.rain.setHandles(handles);
    rendererRef.current = renderer;
  }, [width, height]);

  // Render each frame
  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Re-simulate from scratch for this frame (deterministic)
    const sim = Simulation.fromSeed(SEED, WAYPOINTS);
    sim.runToFrame(frame, fps);

    const players = sim.getPlayers();
    const pellets = sim.getPellets();
    const playerTexts = sim.getPlayerTexts();

    // Feed state to renderer subsystems
    renderer.pellets.setPellets(pellets);
    // Feed local cell positions for pellet magnetism
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

    // Render — use frame-based timestamp for animations
    const now = (frame / fps) * 1000;
    renderer.draw(ctx, width, height, players, "player", playerTexts, now);
  }, [frame, fps, width, height]);

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
