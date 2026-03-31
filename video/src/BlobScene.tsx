import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { spaceGrotesk, spaceMono } from "./fonts";

const GREEN = "#00ff41";

interface Pellet {
  x: number;
  y: number;
  word: string;
  eatAt: number; // seconds when blob eats it
}

const pellets: Pellet[] = [
  { x: 650, y: 420, word: "async", eatAt: 0.8 },
  { x: 850, y: 350, word: "void", eatAt: 1.4 },
  { x: 1050, y: 480, word: "null", eatAt: 2.0 },
  { x: 1250, y: 380, word: "fork", eatAt: 2.6 },
];

const victim = {
  startX: 1500,
  startY: 440,
  name: "@noob",
  color: "hsl(280, 70%, 50%)",
  radius: 55,
  eatAt: 3.8,
};

export const BlobScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  // Main blob enters from left
  const enterProgress = interpolate(frame, [0, fps * 0.6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  // Count eaten pellets and victim
  const eatenPellets = pellets.filter((p) => t >= p.eatAt).length;
  const victimEaten = t >= victim.eatAt;

  // Blob grows with each eat
  const baseRadius = 90;
  const growthPerPellet = 12;
  const growthVictim = 25;
  const targetRadius =
    baseRadius +
    eatenPellets * growthPerPellet +
    (victimEaten ? growthVictim : 0);

  const radius = interpolate(
    frame,
    [0, fps * 5],
    [baseRadius, targetRadius],
    { extrapolateRight: "clamp" },
  );

  // Blob path: moves right across the screen, hitting pellets
  const pathProgress = interpolate(frame, [fps * 0.5, fps * 4.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });
  const blobX = interpolate(pathProgress, [0, 1], [350, 1400]);
  const blobY = 440 + Math.sin(pathProgress * Math.PI * 3) * 40;

  return (
    <AbsoluteFill>
      {/* Word pellets */}
      {pellets.map((p, i) => {
        const eaten = t >= p.eatAt;
        const nearEat = t > p.eatAt - 0.3 && !eaten;
        const pelletOpacity = eaten
          ? interpolate(
              t - p.eatAt,
              [0, 0.15],
              [1, 0],
              { extrapolateRight: "clamp" },
            )
          : 1;
        const pelletScale = nearEat
          ? interpolate(t - (p.eatAt - 0.3), [0, 0.3], [1, 0.6])
          : eaten
            ? 0
            : 1;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: p.x,
              top: p.y,
              transform: `translate(-50%, -50%) scale(${pelletScale})`,
              opacity: pelletOpacity,
            }}
          >
            <span
              style={{
                fontFamily: spaceMono,
                fontSize: 22,
                color: GREEN,
                textShadow: `0 0 10px rgba(0, 255, 65, 0.6)`,
              }}
            >
              {p.word}
            </span>
          </div>
        );
      })}

      {/* Victim blob */}
      {(() => {
        const fleeProgress = interpolate(
          frame,
          [fps * 3, fps * victim.eatAt],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const vx = victim.startX + fleeProgress * 50;
        const vy = victim.startY - fleeProgress * 30;
        const vOpacity = victimEaten
          ? interpolate(t - victim.eatAt, [0, 0.2], [1, 0], {
              extrapolateRight: "clamp",
            })
          : spring({
              frame: frame - 5,
              fps,
              config: { damping: 200 },
            });
        const vScale = victimEaten
          ? interpolate(t - victim.eatAt, [0, 0.2], [1, 0], {
              extrapolateRight: "clamp",
            })
          : 1;

        return (
          <div
            style={{
              position: "absolute",
              left: vx - victim.radius,
              top: vy - victim.radius,
              width: victim.radius * 2,
              height: victim.radius * 2,
              borderRadius: "50%",
              backgroundColor: victim.color,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              opacity: vOpacity,
              transform: `scale(${vScale})`,
              boxShadow: `0 0 20px rgba(160, 80, 255, 0.4)`,
            }}
          >
            <span
              style={{
                fontFamily: spaceGrotesk,
                fontSize: 16,
                fontWeight: 700,
                color: "white",
              }}
            >
              {victim.name}
            </span>
          </div>
        );
      })()}

      {/* Main player blob */}
      <div
        style={{
          position: "absolute",
          left: blobX - radius,
          top: blobY - radius,
          width: radius * 2,
          height: radius * 2,
          borderRadius: "50%",
          backgroundColor: "hsl(160, 70%, 35%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          transform: `scale(${enterProgress})`,
          boxShadow: `0 0 40px rgba(0, 255, 65, 0.3)`,
        }}
      >
        <span
          style={{
            fontFamily: spaceGrotesk,
            fontSize: 24,
            fontWeight: 700,
            color: "white",
          }}
        >
          @you
        </span>
        {/* Show eaten words */}
        {eatenPellets > 0 && (
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              justifyContent: "center",
              maxWidth: radius * 1.6,
              marginTop: 4,
            }}
          >
            {pellets
              .filter((p) => t >= p.eatAt + 0.15)
              .map((p, i) => (
                <span
                  key={i}
                  style={{
                    fontFamily: spaceMono,
                    fontSize: 11,
                    color: `rgba(0, 255, 65, 0.6)`,
                  }}
                >
                  {p.word}
                </span>
              ))}
          </div>
        )}
        {/* Show absorbed player name */}
        {victimEaten && t > victim.eatAt + 0.2 && (
          <span
            style={{
              fontFamily: spaceGrotesk,
              fontSize: 12,
              color: "rgba(180, 120, 255, 0.7)",
              marginTop: 2,
            }}
          >
            {victim.name}
          </span>
        )}
      </div>
    </AbsoluteFill>
  );
};
