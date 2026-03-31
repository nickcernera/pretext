import "./index.css";
import { Composition } from "remotion";
import { LaunchVideo } from "./LaunchVideo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="PretextArenaLaunch"
        component={LaunchVideo}
        durationInFrames={480}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
