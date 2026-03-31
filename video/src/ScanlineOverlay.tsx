import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

export const ScanlineOverlay: React.FC = () => {
  const frame = useCurrentFrame();

  const opacity = interpolate(
    Math.sin(frame * 0.05),
    [-1, 1],
    [0.02, 0.04],
  );

  return (
    <AbsoluteFill
      style={{
        opacity,
        background:
          "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,1) 3px, rgba(0,0,0,1) 4px)",
        pointerEvents: "none",
      }}
    />
  );
};
