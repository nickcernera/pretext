import {
  AbsoluteFill,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { GameCanvas } from "./GameCanvas";
import { GlitchTitle } from "./GlitchTitle";
import { Typewriter } from "./Typewriter";
import { CallToAction } from "./CallToAction";

export const LaunchVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Fade in from black at start
  const fadeIn = interpolate(frame, [0, fps * 1.5], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Fade to black at end
  const fadeOut = interpolate(
    frame,
    [fps * 14.5, fps * 16],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const masterOpacity = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill style={{ backgroundColor: "#050a08" }}>
      {/* Layer 1: Real gameplay (full duration) */}
      <AbsoluteFill style={{ opacity: masterOpacity }}>
        <GameCanvas />
      </AbsoluteFill>

      {/* Layer 2: Dark overlay for title readability */}
      <Sequence from={0} durationInFrames={fps * 6}>
        <AbsoluteFill
          style={{
            backgroundColor: `rgba(5, 10, 8, ${interpolate(
              frame,
              [0, fps * 4, fps * 6],
              [0.5, 0.5, 0],
              { extrapolateRight: "clamp" },
            )})`,
          }}
        />
      </Sequence>

      {/* Scene 1: Title glitch decode (0–5s) */}
      <Sequence from={0} durationInFrames={fps * 5}>
        <GlitchTitle />
      </Sequence>

      {/* Scene 1b: Tagline typewriter (2.5–6s) */}
      <Sequence
        from={Math.floor(fps * 2.5)}
        durationInFrames={Math.floor(fps * 3.5)}
        layout="none"
      >
        <AbsoluteFill
          style={{
            justifyContent: "center",
            alignItems: "center",
            paddingTop: 200,
          }}
        >
          <Typewriter
            text="eat words. absorb players. become the text."
            fontSize={32}
            charsPerFrame={2}
          />
        </AbsoluteFill>
      </Sequence>

      {/* Scene 3: CTA (13–16s) */}
      <Sequence from={fps * 13} durationInFrames={fps * 3}>
        <AbsoluteFill
          style={{
            backgroundColor: `rgba(5, 10, 8, ${interpolate(
              frame - fps * 13,
              [0, fps * 0.5],
              [0, 0.5],
              { extrapolateRight: "clamp" },
            )})`,
          }}
        />
        <CallToAction />
      </Sequence>
    </AbsoluteFill>
  );
};
