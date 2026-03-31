import { interpolate, useCurrentFrame } from "remotion";
import { spaceMono } from "./fonts";

const CURSOR_BLINK = 16;

export const Typewriter: React.FC<{
  text: string;
  fontSize?: number;
  color?: string;
  charsPerFrame?: number;
  delay?: number;
}> = ({
  text,
  fontSize = 36,
  color = "rgba(0, 255, 65, 0.8)",
  charsPerFrame = 2,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const localFrame = Math.max(0, frame - delay);

  const typedCount = Math.min(
    text.length,
    Math.floor(localFrame / charsPerFrame),
  );
  const displayed = text.slice(0, typedCount);
  const done = typedCount >= text.length;

  const cursorOpacity = interpolate(
    frame % CURSOR_BLINK,
    [0, CURSOR_BLINK / 2, CURSOR_BLINK],
    [1, 0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        fontFamily: spaceMono,
        fontSize,
        color,
        letterSpacing: 1,
        opacity: localFrame > 0 ? 1 : 0,
      }}
    >
      <span>{displayed}</span>
      {!done && (
        <span style={{ opacity: cursorOpacity, color }}>
          {"\u258C"}
        </span>
      )}
    </div>
  );
};
