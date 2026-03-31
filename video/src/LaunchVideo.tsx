import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { HomepageScene } from "./HomepageScene";
import { GameCanvas } from "./GameCanvas";
import { GreenFlash } from "./GreenFlash";
import { ScanlineOverlay } from "./ScanlineOverlay";
import { CallToAction } from "./CallToAction";
import { ACT_1, ACT_2, ACT_3 } from "./ActConfig";

export const LaunchVideo: React.FC = () => {
  const { fps } = useVideoConfig();

  const HOMEPAGE_END = Math.floor(fps * 3.5);
  const FLASH_DUR = 3;
  const ACT_DUR = Math.floor(fps * 3.4);
  const ACT1_START = HOMEPAGE_END + FLASH_DUR;
  const ACT1_END = ACT1_START + ACT_DUR;
  const ACT2_START = ACT1_END + FLASH_DUR;
  const ACT2_END = ACT2_START + ACT_DUR;
  const ACT3_START = ACT2_END + FLASH_DUR;
  const ACT3_END = ACT3_START + ACT_DUR;

  return (
    <AbsoluteFill style={{ backgroundColor: "#050a08" }}>
      {/* Homepage Intro */}
      <Sequence from={0} durationInFrames={HOMEPAGE_END}>
        <HomepageScene />
      </Sequence>

      {/* Flash 1 */}
      <Sequence from={HOMEPAGE_END} durationInFrames={FLASH_DUR}>
        <GreenFlash />
      </Sequence>

      {/* Act 1: The Spawn */}
      <Sequence from={ACT1_START} durationInFrames={ACT_DUR}>
        <GameCanvas config={ACT_1} />
      </Sequence>

      {/* Flash 2 */}
      <Sequence from={ACT1_END} durationInFrames={FLASH_DUR}>
        <GreenFlash />
      </Sequence>

      {/* Act 2: The Hunt */}
      <Sequence from={ACT2_START} durationInFrames={ACT_DUR}>
        <GameCanvas config={ACT_2} />
      </Sequence>

      {/* Flash 3 */}
      <Sequence from={ACT2_END} durationInFrames={FLASH_DUR}>
        <GreenFlash />
      </Sequence>

      {/* Act 3: The Domination */}
      <Sequence from={ACT3_START} durationInFrames={ACT_DUR}>
        <GameCanvas config={ACT_3} />
      </Sequence>

      {/* CTA */}
      <Sequence from={ACT3_END} durationInFrames={480 - ACT3_END}>
        <AbsoluteFill style={{ backgroundColor: "rgba(5, 10, 8, 0.6)" }} />
        <CallToAction />
      </Sequence>

      {/* Scanline overlay (full duration) */}
      <ScanlineOverlay />
    </AbsoluteFill>
  );
};
