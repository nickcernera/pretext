import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { spaceGrotesk, spaceMono } from "./fonts";

const GREEN = "#00ff41";

export const CallToAction: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleScale = spring({ frame, fps, config: { damping: 15, stiffness: 200 } });
  const titleY = interpolate(titleScale, [0, 1], [40, 0]);

  const urlOpacity = interpolate(frame, [fps * 0.6, fps * 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const urlY = interpolate(frame, [fps * 0.6, fps * 1], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Pulsing glow on "PLAY NOW"
  const pulse = Math.sin(frame * 0.12) * 0.3 + 0.7;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        gap: 30,
        flexDirection: "column",
      }}
    >
      <div
        style={{
          fontSize: 100,
          fontFamily: spaceGrotesk,
          fontWeight: 700,
          color: GREEN,
          transform: `scale(${titleScale}) translateY(${titleY}px)`,
          textShadow: `0 0 ${40 * pulse}px rgba(0, 255, 65, ${0.7 * pulse}), 0 0 100px rgba(0, 255, 65, 0.3)`,
          letterSpacing: 8,
        }}
      >
        PLAY NOW
      </div>

      <div
        style={{
          fontSize: 32,
          fontFamily: spaceMono,
          color: "rgba(0, 255, 65, 0.7)",
          opacity: urlOpacity,
          transform: `translateY(${urlY}px)`,
          letterSpacing: 2,
        }}
      >
        pretextarena.io
      </div>
    </AbsoluteFill>
  );
};
