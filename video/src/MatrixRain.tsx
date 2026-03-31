import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { spaceMono } from "./fonts";

const BG = "#050a08";
const CHAR_SIZE = 20;
const WIDTH = 1920;
const HEIGHT = 1080;
const COLS = Math.floor(WIDTH / CHAR_SIZE);
const ROWS = Math.floor(HEIGHT / CHAR_SIZE);
const GLYPHS =
  "01アイウエオカキクケコサシスセソタチツテト{}[]<>/*#@!$%&=+ABCDEFGHIJKLMNOP";

const seed = (n: number): number => {
  const x = Math.sin(n * 12345.6789 + 0.1) * 43758.5453;
  return x - Math.floor(x);
};

interface Col {
  speed: number; // rows per second
  offset: number;
  trail: number;
  active: boolean;
}

const columns: Col[] = Array.from({ length: COLS }, (_, i) => ({
  speed: 4 + seed(i * 7 + 1) * 10,
  offset: seed(i * 13 + 2) * ROWS * 3,
  trail: 8 + Math.floor(seed(i * 19 + 3) * 16),
  active: seed(i * 31 + 5) > 0.35, // ~65% of columns active
}));

const charFor = (col: number, row: number, frame: number): string => {
  const idx = Math.floor(seed(col * 997 + row * 131 + Math.floor(frame / 8)) * GLYPHS.length);
  return GLYPHS[idx];
};

export const MatrixRain: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeIn = interpolate(frame, [0, fps], [0, 1], {
    extrapolateRight: "clamp",
  });

  const elements: React.ReactNode[] = [];

  for (let c = 0; c < COLS; c++) {
    if (!columns[c].active) continue;
    const { speed, offset, trail } = columns[c];
    const headF = offset + (frame / fps) * speed;
    const headRow = headF % (ROWS + trail + 10);

    for (let t = 0; t < trail; t++) {
      const row = Math.floor(headRow) - t;
      if (row < 0 || row >= ROWS) continue;

      const brightness =
        t === 0
          ? 1
          : interpolate(t, [0, trail], [0.8, 0], {
              extrapolateRight: "clamp",
            });

      elements.push(
        <span
          key={`${c}-${row}`}
          style={{
            position: "absolute",
            left: c * CHAR_SIZE,
            top: row * CHAR_SIZE,
            fontSize: CHAR_SIZE - 3,
            fontFamily: spaceMono,
            color:
              t === 0
                ? "#fff"
                : `rgba(0, 255, 65, ${brightness})`,
            lineHeight: 1,
            willChange: "auto",
          }}
        >
          {charFor(c, row, frame)}
        </span>,
      );
    }
  }

  return (
    <AbsoluteFill style={{ backgroundColor: BG, opacity: fadeIn, overflow: "hidden" }}>
      {elements}
    </AbsoluteFill>
  );
};
