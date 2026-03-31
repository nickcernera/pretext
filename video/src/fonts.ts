import { loadFont as loadSpaceGrotesk } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadSpaceMono } from "@remotion/google-fonts/SpaceMono";

export const { fontFamily: spaceGrotesk } = loadSpaceGrotesk("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
});

export const { fontFamily: spaceMono } = loadSpaceMono("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
});
