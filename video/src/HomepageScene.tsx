// video/src/HomepageScene.tsx
import { useEffect, useRef } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { prepareWithSegments, layoutNextLine } from "@chenglou/pretext";
import { SEA_WORDS } from "@shared/words";
import { spaceGrotesk, spaceMono } from "./fonts";
import { createRng } from "./seededRandom";

const BG = "#050a08";
const GREEN = "#00ff41";
const BRIGHT = "#d0ffe0";
const MUTED = "#4a7a5a";
const SEA_FONT_SIZE = 12;
const LINE_HEIGHT = 18;

// Build deterministic sea corpus
const rng = createRng(777);
const seaWords: string[] = [];
for (let i = 0; i < 5000; i++) {
  seaWords.push(SEA_WORDS[Math.floor(rng() * SEA_WORDS.length)]);
}
const SEA_CORPUS = seaWords.join("  ");

export const HomepageScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Cursor position — lands on Quick Play button center
  // Button is roughly at height/2 + 130 (below title+tagline+attribution+gap)
  const btnCenterX = width / 2;
  const btnCenterY = height / 2 + 130;
  const cursorX = interpolate(
    frame,
    [fps * 0.8, fps * 2.5, fps * 3],
    [width * 0.65, btnCenterX, btnCenterX],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) },
  );
  const cursorY = interpolate(
    frame,
    [fps * 0.8, fps * 2.5, fps * 3],
    [height * 0.3, btnCenterY, btnCenterY],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) },
  );

  // Draw text sea to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, width, height);

    // Radial gradients (matching game background)
    const g1 = ctx.createRadialGradient(width * 0.3, height * 0.4, 0, width * 0.3, height * 0.4, width * 0.5);
    g1.addColorStop(0, "rgba(0, 80, 60, 0.35)");
    g1.addColorStop(1, "transparent");
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, width, height);

    const g2 = ctx.createRadialGradient(width * 0.7, height * 0.6, 0, width * 0.7, height * 0.6, width * 0.45);
    g2.addColorStop(0, "rgba(20, 50, 120, 0.3)");
    g2.addColorStop(1, "transparent");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, width, height);

    // Text sea
    const font = `${SEA_FONT_SIZE}px "Space Mono", monospace`;
    ctx.font = font;
    ctx.textBaseline = "top";

    const prepared = prepareWithSegments(SEA_CORPUS, font);
    let cursor = { segmentIndex: 0, graphemeIndex: 0 };

    // Panel exclusion zone (tighter to match actual content)
    const panelW = 480;
    const panelH = 260;
    const panelX = (width - panelW) / 2;
    const panelY = (height - panelH) / 2;

    let y = 8;
    while (y < height) {
      const lineTop = y;
      const lineBottom = y + LINE_HEIGHT;
      const midY = (lineTop + lineBottom) / 2;

      let spans: { left: number; right: number }[] = [{ left: 8, right: width - 8 }];

      // Exclude panel area with rounded corners
      if (midY > panelY && midY < panelY + panelH) {
        const cr = 24;
        let inset = 0;
        if (midY < panelY + cr) {
          const dy = panelY + cr - midY;
          inset = cr - Math.sqrt(Math.max(0, cr * cr - dy * dy));
        } else if (midY > panelY + panelH - cr) {
          const dy = midY - (panelY + panelH - cr);
          inset = cr - Math.sqrt(Math.max(0, cr * cr - dy * dy));
        }
        const exL = panelX + inset;
        const exR = panelX + panelW - inset;
        const next: typeof spans = [];
        for (const span of spans) {
          if (exR <= span.left || exL >= span.right) {
            next.push(span);
          } else {
            if (exL > span.left + 20) next.push({ left: span.left, right: exL });
            if (exR < span.right - 20) next.push({ left: exR, right: span.right });
          }
        }
        spans = next;
      }

      for (const span of spans) {
        const maxWidth = span.right - span.left;
        if (maxWidth < 30) continue;

        const line = layoutNextLine(prepared, cursor, maxWidth);
        if (!line) {
          cursor = { segmentIndex: 0, graphemeIndex: 0 };
          break;
        }

        // Opacity: base + halo near panel + spotlight near cursor
        let alpha = 0.08;

        // Panel halo
        const closestPanelX = Math.max(panelX, Math.min(panelX + panelW, (span.left + span.right) / 2));
        const closestPanelY = Math.max(panelY, Math.min(panelY + panelH, midY));
        const panelDist = Math.sqrt(
          ((span.left + span.right) / 2 - closestPanelX) ** 2 +
          (midY - closestPanelY) ** 2
        );
        if (panelDist < 200) {
          alpha = Math.max(alpha, 0.08 + (1 - panelDist / 200) * 0.22);
        }

        // Cursor spotlight
        const nearX = Math.max(span.left, Math.min(span.right, cursorX));
        const nearY = Math.max(lineTop, Math.min(lineBottom, cursorY));
        const cursorDist = Math.sqrt((nearX - cursorX) ** 2 + (nearY - cursorY) ** 2);
        if (cursorDist < 150) {
          alpha = Math.max(alpha, 0.1 + (1 - cursorDist / 150) * 0.6);
        }

        ctx.globalAlpha = alpha;
        ctx.fillStyle = GREEN;
        ctx.fillText(line.text, span.left, y);
        cursor = line.end;
      }

      y += LINE_HEIGHT;
    }
    ctx.globalAlpha = 1;
  }, [frame, fps, width, height, cursorX, cursorY]);

  // Cursor visibility and click
  const cursorVisible = frame > fps * 0.5;
  const cursorOpacity = interpolate(frame, [fps * 0.5, fps * 0.8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const clickFrame = Math.floor(fps * 3);
  const clicked = frame >= clickFrame;
  const clickFlash = clicked
    ? interpolate(frame - clickFrame, [0, 4], [1, 0], { extrapolateRight: "clamp" })
    : 0;

  // Panel fade in
  const panelOpacity = interpolate(frame, [0, fps * 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });

  const buttonBg = clicked ? `rgba(0, 255, 65, ${0.2 + clickFlash * 0.3})` : "#1a2a1a";

  return (
    <AbsoluteFill>
      {/* Text sea canvas */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ width: "100%", height: "100%", position: "absolute" }}
      />

      {/* Center panel */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          opacity: panelOpacity,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18,
          }}
        >
          <div
            style={{
              fontSize: 80,
              fontFamily: spaceGrotesk,
              fontWeight: 700,
              color: BRIGHT,
              letterSpacing: -2,
            }}
          >
            pretext arena
          </div>
          <div
            style={{
              fontSize: 18,
              fontFamily: spaceMono,
              color: MUTED,
            }}
          >
            you are your text. eat or be eaten.
          </div>
          <div
            style={{
              fontSize: 16,
              fontFamily: spaceMono,
              color: GREEN,
              opacity: 0.8,
              marginTop: -4,
            }}
          >
            powered by{" "}
            <span style={{ color: BRIGHT, fontWeight: 700 }}>
              @chenglou/pretext
            </span>
          </div>
          <div
            style={{
              marginTop: 24,
              padding: "16px 48px",
              border: `1px solid ${GREEN}`,
              borderRadius: 4,
              backgroundColor: buttonBg,
              fontSize: 18,
              fontFamily: spaceMono,
              fontWeight: 700,
              color: GREEN,
            }}
          >
            Quick Play
          </div>
        </div>
      </AbsoluteFill>

      {/* Animated crosshair cursor (matches game's actual cursor) */}
      {cursorVisible && (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          style={{
            position: "absolute",
            left: cursorX - 12,
            top: cursorY - 12,
            opacity: cursorOpacity,
            filter: `drop-shadow(0 0 2px ${GREEN}) drop-shadow(0 0 ${6 + clickFlash * 14}px ${GREEN}) drop-shadow(0 0 ${14 + clickFlash * 20}px rgba(0,255,65,0.4))`,
          }}
        >
          {/* Top arm */}
          <line x1="12" y1="2" x2="12" y2="8" stroke={GREEN} strokeWidth="1.5" strokeLinecap="round" />
          {/* Bottom arm */}
          <line x1="12" y1="16" x2="12" y2="22" stroke={GREEN} strokeWidth="1.5" strokeLinecap="round" />
          {/* Left arm */}
          <line x1="2" y1="12" x2="8" y2="12" stroke={GREEN} strokeWidth="1.5" strokeLinecap="round" />
          {/* Right arm */}
          <line x1="16" y1="12" x2="22" y2="12" stroke={GREEN} strokeWidth="1.5" strokeLinecap="round" />
          {/* Center dot */}
          <circle cx="12" cy="12" r="1.5" fill={GREEN} />
        </svg>
      )}
    </AbsoluteFill>
  );
};
