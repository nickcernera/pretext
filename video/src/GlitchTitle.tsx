import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { spaceGrotesk } from "./fonts";

const TITLE = "PRETEXT ARENA";
const SCRAMBLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*<>/";
const GREEN = "#00ff41";
const DECODE_STAGGER = 4; // frames between each char settling

const seed = (n: number): number => {
  const x = Math.sin(n * 12345.6789 + 0.1) * 43758.5453;
  return x - Math.floor(x);
};

export const GlitchTitle: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const appearOpacity = interpolate(frame, [0, fps * 0.3], [0, 1], {
    extrapolateRight: "clamp",
  });

  const scaleIn = spring({ frame, fps, config: { damping: 200 } });
  const scale = interpolate(scaleIn, [0, 1], [0.7, 1]);

  // Glow pulses after all chars settled
  const allSettledAt = fps * 0.5 + TITLE.length * DECODE_STAGGER;
  const glowPulse =
    frame > allSettledAt
      ? 0.6 + 0.4 * Math.sin((frame - allSettledAt) * 0.15)
      : 0;

  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center" }}
    >
      <div
        style={{
          display: "flex",
          gap: 4,
          opacity: appearOpacity,
          transform: `scale(${scale})`,
        }}
      >
        {TITLE.split("").map((char, i) => {
          const settleFrame = Math.floor(fps * 0.5) + i * DECODE_STAGGER;
          const settled = frame >= settleFrame;

          const displayed = settled
            ? char
            : SCRAMBLE[
                Math.floor(seed(frame * 100 + i * 7) * SCRAMBLE.length)
              ];

          const pop = settled
            ? spring({
                frame: frame - settleFrame,
                fps,
                config: { damping: 20, stiffness: 200 },
              })
            : 0;

          return (
            <span
              key={i}
              style={{
                fontSize: 110,
                fontFamily: spaceGrotesk,
                fontWeight: 700,
                color: settled ? GREEN : "rgba(0, 255, 65, 0.4)",
                textShadow: settled
                  ? `0 0 ${30 + glowPulse * 30}px rgba(0, 255, 65, ${0.6 + glowPulse * 0.3}), 0 0 80px rgba(0, 255, 65, 0.3)`
                  : "none",
                transform: `scale(${1 + pop * 0.08})`,
                display: "inline-block",
              }}
            >
              {displayed}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
