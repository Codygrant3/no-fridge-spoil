import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
  Easing,
  AbsoluteFill,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Fraunces';

/**
 * Design Philosophy: "Fresh Simplicity"
 *
 * A refined, purposeful intro with:
 * - Clean food choreography from a single direction
 * - 3D perspective text with depth layers
 * - Subtle ambient particles
 * - Dramatic light rays
 * - Multi-layered text animations
 */

// Load Fraunces font for premium typography
const { fontFamily: fraunces } = loadFont('normal', {
  weights: ['400', '600', '700'],
  subsets: ['latin'],
});

type AppIntroProps = {
  appName: string;
  tagline: string;
};

// ============================================
// FOOD EMOJI CHOREOGRAPHY
// ============================================

const FOOD_EMOJIS = [
  // Simplified choreography: 8 representative items, all entering from left
  // One from each category for cleaner, more focused presentation

  // Vegetable
  { emoji: '🥬', startX: -150, startY: 400, endX: 120, endY: 350, delay: 0, scale: 1.2, rotation: -15 },

  // Fruit
  { emoji: '🍎', startX: -150, startY: 550, endX: 950, endY: 450, delay: 4, scale: 1.3, rotation: 12 },

  // Dairy
  { emoji: '🥛', startX: -150, startY: 700, endX: 150, endY: 650, delay: 8, scale: 1.15, rotation: -8 },

  // Protein
  { emoji: '🥚', startX: -150, startY: 850, endX: 920, endY: 780, delay: 12, scale: 1.1, rotation: 10 },

  // Grain
  { emoji: '🍞', startX: -150, startY: 1100, endX: 140, endY: 1050, delay: 16, scale: 1.2, rotation: -12 },

  // Citrus
  { emoji: '🍊', startX: -150, startY: 1250, endX: 900, endY: 1200, delay: 20, scale: 1.15, rotation: 15 },

  // Herb (top accent)
  { emoji: '🌿', startX: -100, startY: 280, endX: 100, endY: 250, delay: 6, scale: 0.9, rotation: -25 },

  // Herb (bottom accent)
  { emoji: '🌱', startX: -100, startY: 1500, endX: 130, endY: 1450, delay: 24, scale: 0.85, rotation: 18 },
];

// ============================================
// PARTICLE SYSTEMS
// ============================================

const GlowParticle = ({
  x,
  y,
  delay,
  color,
  size,
  duration,
}: {
  x: number;
  y: number;
  delay: number;
  color: string;
  size: number;
  duration: number;
}) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(
    frame,
    [delay, delay + duration * 0.3, delay + duration * 0.7, delay + duration],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const scale = interpolate(
    frame,
    [delay, delay + duration * 0.5, delay + duration],
    [0.5, 1.2, 0.8],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const pulse = Math.sin((frame - delay) * 0.3) * 0.2 + 1;

  return (
    <div
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        opacity,
        transform: `scale(${scale * pulse})`,
        boxShadow: `
          0 0 ${size}px ${color},
          0 0 ${size * 2}px ${color},
          0 0 ${size * 3}px ${color}
        `,
      }}
    />
  );
};

const ParticleField = ({ startFrame }: { startFrame: number }) => {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    x: 100 + Math.random() * 880,
    y: 300 + Math.random() * 1300,
    delay: startFrame + Math.random() * 30,
    color: ['rgba(74, 222, 128, 0.8)', 'rgba(20, 184, 166, 0.7)', 'rgba(132, 204, 22, 0.75)'][i % 3],
    size: 4 + Math.random() * 8,
    duration: 25 + Math.random() * 20,
  }));

  return (
    <>
      {particles.map((p, i) => (
        <GlowParticle key={i} {...p} />
      ))}
    </>
  );
};

// Explosive particle burst
const ExplosiveBurst = ({
  x,
  y,
  startFrame,
  particleCount,
  colors,
  maxRadius,
}: {
  x: number;
  y: number;
  startFrame: number;
  particleCount: number;
  colors: string[];
  maxRadius: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <>
      {Array.from({ length: particleCount }, (_, i) => {
        const angle = (i / particleCount) * Math.PI * 2 + (i % 2) * 0.2;
        const delay = startFrame + i * 0.3;
        const speed = 0.7 + Math.random() * 0.6;

        const progress = spring({
          frame: frame - delay,
          fps,
          config: { damping: 25, stiffness: 60 },
        });

        const distance = progress * maxRadius * speed;
        const px = x + Math.cos(angle) * distance;
        const py = y + Math.sin(angle) * distance;

        const opacity = interpolate(
          frame,
          [delay, delay + 10, delay + 30, delay + 45],
          [0, 1, 0.8, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );

        const size = 6 + Math.random() * 10;
        const color = colors[i % colors.length];

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: px - size / 2,
              top: py - size / 2,
              width: size,
              height: size,
              borderRadius: '50%',
              backgroundColor: color,
              opacity,
              boxShadow: `0 0 ${size * 2}px ${color}, 0 0 ${size * 4}px ${color}`,
            }}
          />
        );
      })}
    </>
  );
};

// ============================================
// FOOD EMOJI COMPONENT WITH TRAILS
// ============================================

const FoodEmoji = ({
  emoji,
  startX,
  startY,
  endX,
  endY,
  delay,
  scale,
  rotation,
}: {
  emoji: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  delay: number;
  scale: number;
  rotation: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entryProgress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 11, stiffness: 140 },
  });

  const x = interpolate(entryProgress, [0, 1], [startX, endX]);
  const y = interpolate(entryProgress, [0, 1], [startY, endY]);

  // Bounce after landing
  const bounceFrame = frame - delay - 12;
  const bounce = bounceFrame > 0
    ? Math.sin(bounceFrame * 0.35) * Math.exp(-bounceFrame * 0.1) * 18
    : 0;

  // Gentle floating
  const floatY = frame > delay + 25
    ? Math.sin((frame - delay) * 0.06) * 10
    : 0;

  const floatRotation = frame > delay + 25
    ? Math.sin((frame - delay) * 0.04) * 6
    : 0;

  const scaleAnim = spring({
    frame: frame - delay,
    fps,
    config: { damping: 7, stiffness: 180 },
  });

  const finalScale = interpolate(scaleAnim, [0, 1], [0, scale]);

  const rotationAnim = interpolate(
    entryProgress,
    [0, 1],
    [rotation + (rotation > 0 ? 540 : -540), rotation + floatRotation]
  );

  const opacity = interpolate(frame, [delay, delay + 6], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Motion trails
  const trails = Array.from({ length: 6 }, (_, i) => {
    const trailDelay = delay + i * 1.2;
    const trailProgress = spring({
      frame: frame - trailDelay,
      fps,
      config: { damping: 11, stiffness: 140 },
    });

    const trailX = interpolate(trailProgress, [0, 1], [startX, endX]);
    const trailY = interpolate(trailProgress, [0, 1], [startY, endY]);
    const trailOpacity = interpolate(
      frame,
      [trailDelay, trailDelay + 8, trailDelay + 16],
      [0, 0.35 - i * 0.05, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );
    const trailScale = finalScale * (0.85 - i * 0.1);

    return (
      <div
        key={`trail-${i}`}
        style={{
          position: 'absolute',
          left: trailX,
          top: trailY,
          fontSize: 85,
          transform: `translate(-50%, -50%) scale(${trailScale})`,
          opacity: trailOpacity,
          filter: `blur(${3 + i * 2}px)`,
        }}
      >
        {emoji}
      </div>
    );
  });

  if (frame < delay) return null;

  return (
    <>
      {trails}
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y + bounce + floatY,
          fontSize: 85,
          transform: `translate(-50%, -50%) scale(${finalScale}) rotate(${rotationAnim}deg)`,
          opacity,
          filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.35))',
        }}
      >
        {emoji}
      </div>
    </>
  );
};

// ============================================
// EPIC 3D TEXT ANIMATION
// ============================================

const Epic3DLetter = ({
  letter,
  index,
  totalLetters,
  startFrame,
  wordStartX,
}: {
  letter: string;
  index: number;
  totalLetters: number;
  startFrame: number;
  wordStartX: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const letterDelay = startFrame + index * 3;

  // 3D flip-in from behind
  const flipProgress = spring({
    frame: frame - letterDelay,
    fps,
    config: { damping: 12, stiffness: 120 },
  });

  // Scale bounce
  const scaleSpring = spring({
    frame: frame - letterDelay,
    fps,
    config: { damping: 8, stiffness: 200 },
  });

  // Rotation from 3D space
  const rotateX = interpolate(flipProgress, [0, 1], [-90, 0]);
  const rotateY = interpolate(flipProgress, [0, 1], [index % 2 === 0 ? -45 : 45, 0]);

  // Z-depth simulation
  const translateZ = interpolate(flipProgress, [0, 1], [-200, 0]);

  // Scale with overshoot
  const scale = interpolate(scaleSpring, [0, 1], [0, 1]);

  // Y position - drop in
  const translateY = interpolate(flipProgress, [0, 1], [-100, 0]);

  // Opacity
  const opacity = interpolate(frame, [letterDelay, letterDelay + 8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Wave motion after landing
  const waveY = frame > letterDelay + 20
    ? Math.sin((frame - letterDelay) * 0.1 + index * 0.4) * 8
    : 0;

  // Glow pulse
  const glowPulse = frame > letterDelay + 15
    ? 0.5 + Math.sin((frame - letterDelay) * 0.15 + index * 0.3) * 0.3
    : interpolate(frame, [letterDelay, letterDelay + 15], [0, 0.5], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });

  // Color shift
  const hue = 145 + Math.sin((frame - letterDelay) * 0.05 + index * 0.2) * 15;

  if (frame < letterDelay) return null;

  return (
    <div
      style={{
        display: 'inline-block',
        position: 'relative',
        perspective: '1000px',
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Shadow/depth layers - deeper and more dramatic */}
      {[6, 5, 4, 3, 2, 1].map((depth) => (
        <span
          key={depth}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            fontSize: 100,
            fontWeight: 700,
            fontFamily: fraunces,
            color: `rgba(0, 40, 20, ${0.25 - depth * 0.035})`,
            transform: `
              translateY(${translateY + waveY}px)
              translateZ(${translateZ - depth * 5}px)
              rotateX(${rotateX}deg)
              rotateY(${rotateY}deg)
              scale(${scale})
              translate(${depth * 3}px, ${depth * 3}px)
            `,
            opacity: opacity * 0.7,
            whiteSpace: 'pre',
          }}
        >
          {letter}
        </span>
      ))}

      {/* Main letter with gradient effect */}
      <span
        style={{
          position: 'relative',
          fontSize: 100,
          fontWeight: 700,
          fontFamily: fraunces,
          background: `linear-gradient(160deg,
            #bbf7d0 0%,
            #4ade80 25%,
            #22c55e 50%,
            #16a34a 75%,
            #4ade80 100%)`,
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          color: 'transparent',
          transform: `
            translateY(${translateY + waveY}px)
            translateZ(${translateZ}px)
            rotateX(${rotateX}deg)
            rotateY(${rotateY}deg)
            scale(${scale})
          `,
          opacity,
          filter: `
            drop-shadow(0 0 15px hsla(${hue}, 85%, 55%, ${glowPulse}))
            drop-shadow(0 0 30px hsla(${hue}, 80%, 50%, ${glowPulse * 0.7}))
            drop-shadow(0 0 50px hsla(${hue}, 75%, 45%, ${glowPulse * 0.5}))
            drop-shadow(0 6px 12px rgba(0, 0, 0, 0.5))
          `,
          whiteSpace: 'pre',
          display: 'inline-block',
        }}
      >
        {letter}
      </span>
    </div>
  );
};

const EpicTitle = ({ text, startFrame }: { text: string; startFrame: number }) => {
  const letters = text.split('');

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 2,
        perspective: '1200px',
        transformStyle: 'preserve-3d',
      }}
    >
      {letters.map((letter, index) => (
        <Epic3DLetter
          key={index}
          letter={letter}
          index={index}
          totalLetters={letters.length}
          startFrame={startFrame}
          wordStartX={0}
        />
      ))}
    </div>
  );
};

// ============================================
// SHOCKWAVE EFFECT
// ============================================

const Shockwave = ({ startFrame, x, y }: { startFrame: number; x: number; y: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 30, stiffness: 40 },
  });

  const size = interpolate(progress, [0, 1], [0, 1200]);
  const opacity = interpolate(progress, [0, 0.3, 1], [0, 0.6, 0]);
  const borderWidth = interpolate(progress, [0, 1], [20, 2]);

  if (frame < startFrame) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: '50%',
        border: `${borderWidth}px solid rgba(74, 222, 128, ${opacity})`,
        boxShadow: `
          0 0 30px rgba(74, 222, 128, ${opacity * 0.5}),
          inset 0 0 30px rgba(74, 222, 128, ${opacity * 0.3})
        `,
      }}
    />
  );
};

// ============================================
// RADIAL LIGHT BURST
// ============================================

const RadialBurst = ({ startFrame }: { startFrame: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 25, stiffness: 50 },
  });

  const opacity = interpolate(
    frame,
    [startFrame, startFrame + 12, startFrame + 35],
    [0, 0.7, 0.15],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const rotation = interpolate(frame, [startFrame, startFrame + 120], [0, 45]);

  const rays = 20;

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg)`,
        opacity,
      }}
    >
      {Array.from({ length: rays }, (_, i) => {
        const isLong = i % 2 === 0;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: isLong ? 6 : 3,
              height: isLong ? 700 : 500,
              background: `linear-gradient(to bottom,
                rgba(74, 222, 128, ${isLong ? 0.9 : 0.6}),
                rgba(20, 184, 166, 0.3),
                transparent)`,
              transformOrigin: 'top center',
              transform: `translateX(-50%) rotate(${(i / rays) * 360}deg)`,
              borderRadius: '50%',
            }}
          />
        );
      })}
    </div>
  );
};

// ============================================
// LOGO WITH EPIC ENTRANCE
// ============================================

const EpicLogo = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoDelay = 32;

  // Zoom in from distance with rotation
  const zoomProgress = spring({
    frame: frame - logoDelay,
    fps,
    config: { damping: 10, stiffness: 150 },
  });

  const scale = interpolate(zoomProgress, [0, 1], [0.1, 1]);
  const rotation = interpolate(zoomProgress, [0, 1], [-720, 0]);
  const translateZ = interpolate(zoomProgress, [0, 1], [-500, 0]);

  // Glow intensity
  const glowIntensity = interpolate(
    frame,
    [logoDelay + 15, logoDelay + 30, logoDelay + 50, logoDelay + 70],
    [0, 1, 0.6, 0.9],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Pulse
  const pulse = frame > logoDelay + 20
    ? 1 + Math.sin((frame - logoDelay) * 0.15) * 0.05
    : 1;

  const opacity = interpolate(frame, [logoDelay, logoDelay + 8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  if (frame < logoDelay) return null;

  return (
    <div
      style={{
        position: 'relative',
        transform: `scale(${scale * pulse}) rotate(${rotation}deg) translateZ(${translateZ}px)`,
        opacity,
        perspective: '1000px',
      }}
    >
      {/* Outer glow rings */}
      {[3, 2, 1].map((ring) => (
        <div
          key={ring}
          style={{
            position: 'absolute',
            inset: -20 * ring,
            borderRadius: 56 + ring * 20,
            background: `radial-gradient(circle,
              rgba(74, 222, 128, ${glowIntensity * 0.2 / ring}) 0%,
              transparent 70%)`,
            transform: `scale(${1 + Math.sin((frame - logoDelay) * 0.1 + ring) * 0.05})`,
          }}
        />
      ))}

      {/* Main container */}
      <div
        style={{
          width: 240,
          height: 240,
          backgroundColor: '#f5f2ed',
          borderRadius: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `
            0 40px 80px rgba(0, 0, 0, 0.4),
            0 0 ${80 + glowIntensity * 100}px rgba(74, 222, 128, ${glowIntensity * 0.7}),
            0 0 ${150 + glowIntensity * 150}px rgba(74, 222, 128, ${glowIntensity * 0.4}),
            inset 0 3px 0 rgba(255, 255, 255, 0.9),
            inset 0 -3px 0 rgba(0, 0, 0, 0.15)
          `,
        }}
      >
        <span style={{ fontSize: 130, filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))' }}>🥗</span>
      </div>
    </div>
  );
};

// ============================================
// TAGLINE WITH TYPEWRITER EFFECT
// ============================================

const EpicTagline = ({ text, startFrame }: { text: string; startFrame: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const characters = text.split('');

  const containerOpacity = interpolate(
    frame,
    [startFrame, startFrame + 8],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const containerY = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 18, stiffness: 90 },
  });

  const y = interpolate(containerY, [0, 1], [50, 0]);

  return (
    <div
      style={{
        fontSize: 48,
        fontWeight: 400,
        fontStyle: 'italic',
        color: 'rgba(187, 247, 208, 0.95)',
        fontFamily: fraunces,
        opacity: containerOpacity,
        transform: `translateY(${y}px)`,
        letterSpacing: 3,
        textShadow: `
          0 0 20px rgba(74, 222, 128, 0.5),
          0 0 40px rgba(74, 222, 128, 0.3),
          0 4px 20px rgba(0, 0, 0, 0.5)
        `,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      {characters.map((char, i) => {
        const charDelay = startFrame + 4 + i * 0.8;

        const charOpacity = interpolate(
          frame,
          [charDelay, charDelay + 3],
          [0, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );

        const charScale = spring({
          frame: frame - charDelay,
          fps,
          config: { damping: 15, stiffness: 200 },
        });

        return (
          <span
            key={i}
            style={{
              opacity: charOpacity,
              transform: `scale(${interpolate(charScale, [0, 1], [0.5, 1])})`,
              display: 'inline-block',
              whiteSpace: 'pre',
            }}
          >
            {char}
          </span>
        );
      })}
    </div>
  );
};

// ============================================
// BACKGROUND & OVERLAYS
// ============================================

const AnimatedBackground = () => {
  const frame = useCurrentFrame();

  const gradientAngle = interpolate(frame, [0, 150], [130, 160]);
  const shift1 = interpolate(frame, [0, 150], [0, 12]);
  const shift2 = interpolate(frame, [0, 150], [25, 45]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `linear-gradient(${gradientAngle}deg,
          hsl(155, 38%, ${10 + shift1}%) 0%,
          hsl(158, 42%, ${18 + shift1}%) 25%,
          hsl(168, 55%, ${28 + shift2}%) 55%,
          hsl(150, 70%, ${45 + shift2}%) 85%,
          hsl(140, 80%, ${55 + shift2}%) 100%)`,
      }}
    />
  );
};

const Vignette = () => {
  const frame = useCurrentFrame();
  const intensity = interpolate(frame, [0, 40], [0.25, 0.55], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(ellipse at center, transparent 15%, rgba(8, 20, 15, ${intensity}) 100%)`,
        pointerEvents: 'none',
      }}
    />
  );
};

const NoiseOverlay = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 25], [0, 0.045], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        opacity,
        mixBlendMode: 'overlay',
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      }}
    />
  );
};

const FadeOut = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const fadeStart = durationInFrames - 15;

  const opacity = interpolate(frame, [fadeStart, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: '#0a1410',
        opacity,
      }}
    />
  );
};

// ============================================
// MAIN COMPOSITION
// ============================================

export const AppIntro = ({ appName, tagline }: AppIntroProps) => {
  return (
    <AbsoluteFill>
      {/* Animated gradient background */}
      <AnimatedBackground />

      {/* Noise texture */}
      <NoiseOverlay />

      {/* Ambient particle field */}
      <ParticleField startFrame={5} />

      {/* All the flying food emojis - lower z-index to stay behind text */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
        {FOOD_EMOJIS.map((food, index) => (
          <FoodEmoji key={index} {...food} />
        ))}
      </div>

      {/* Shockwaves removed for cleaner aesthetic */}

      {/* Radial light burst behind logo */}
      <Sequence from={30}>
        <RadialBurst startFrame={0} />
      </Sequence>

      {/* Explosive particle bursts */}
      <ExplosiveBurst
        x={540}
        y={960}
        startFrame={38}
        particleCount={24}
        colors={['rgba(74, 222, 128, 0.9)', 'rgba(20, 184, 166, 0.8)', 'rgba(250, 250, 250, 0.7)']}
        maxRadius={350}
      />
      <ExplosiveBurst
        x={300}
        y={750}
        startFrame={48}
        particleCount={16}
        colors={['rgba(132, 204, 22, 0.85)', 'rgba(74, 222, 128, 0.75)']}
        maxRadius={200}
      />
      <ExplosiveBurst
        x={780}
        y={1150}
        startFrame={52}
        particleCount={16}
        colors={['rgba(20, 184, 166, 0.85)', 'rgba(74, 222, 128, 0.75)']}
        maxRadius={200}
      />

      {/* Main content - HIGH z-index to always be in front of food */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 45,
          zIndex: 100,
        }}
      >
        {/* Epic Logo */}
        <EpicLogo />

        {/* EPIC 3D Animated Title */}
        <Sequence from={50}>
          <div style={{ marginTop: 35 }}>
            <EpicTitle text={appName} startFrame={0} />
          </div>
        </Sequence>

        {/* Tagline - earlier appearance for better pacing */}
        <Sequence from={70}>
          <EpicTagline text={tagline} startFrame={0} />
        </Sequence>
      </div>

      {/* Vignette overlay */}
      <Vignette />

      {/* Fade out to app */}
      <FadeOut />
    </AbsoluteFill>
  );
};
