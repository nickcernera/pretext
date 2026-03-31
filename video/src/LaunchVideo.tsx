import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { MatrixRain } from "./MatrixRain";
import { GlitchTitle } from "./GlitchTitle";
import { Typewriter } from "./Typewriter";
import { BlobScene } from "./BlobScene";
import { CallToAction } from "./CallToAction";

export const LaunchVideo: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
      {/* Layer 1: Matrix rain background (always on) */}
      <MatrixRain />

      {/* Layer 2: Dark overlay so text is readable */}
      <AbsoluteFill
        style={{ backgroundColor: "rgba(5, 10, 8, 0.4)" }}
      />

      {/* Scene 1: Title glitch decode (0–5s) */}
      <Sequence
        from={0}
        durationInFrames={fps * 5}

      >
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
            paddingTop: 220,
          }}
        >
          <Typewriter
            text="eat words. absorb players. become the text."
            fontSize={32}
            charsPerFrame={2}
          />
        </AbsoluteFill>
      </Sequence>

      {/* Scene 2: Blob eating demo (6–11s) */}
      <Sequence
        from={fps * 6}
        durationInFrames={fps * 5}

      >
        <BlobScene />
      </Sequence>

      {/* Scene 3: Call to action (11.5–16s) */}
      <Sequence
        from={Math.floor(fps * 11.5)}
        durationInFrames={Math.floor(fps * 4.5)}

      >
        <CallToAction />
      </Sequence>
    </AbsoluteFill>
  );
};
