import { Composition } from 'remotion';
import { AppIntro } from './AppIntro';

/**
 * Remotion Root - Defines all available compositions
 *
 * Mobile Portrait 9:16 format for splash screen replacement
 * 5 seconds at 30fps = 150 frames (EPIC cinematic intro)
 */
export const RemotionRoot = () => {
  return (
    <Composition
      id="AppIntro"
      component={AppIntro}
      durationInFrames={150}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        appName: 'No Fridge Spoil',
        tagline: 'Track freshness. Reduce waste.',
      }}
    />
  );
};
