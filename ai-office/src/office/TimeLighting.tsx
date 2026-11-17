import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Color, MathUtils, type AmbientLight, type DirectionalLight } from 'three';

type TimeLightingProps = { officeHour: number };

function getLightProfile(hour: number) {
  if (hour >= 8 && hour < 16) return { color: '#ffb347', intensity: 1.2 };
  if (hour >= 16 && hour < 19) return { color: '#f59e66', intensity: 1.05 };
  if (hour >= 19 && hour < 22) return { color: '#c77b5c', intensity: 0.75 };
  return { color: '#8f5d49', intensity: 0.45 };
}

export function TimeLighting({ officeHour }: TimeLightingProps) {
  const directional = useRef<DirectionalLight>(null);
  const ambient = useRef<AmbientLight>(null);
  const targetColor = useMemo(() => new Color(), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const blend = MathUtils.clamp(dt * 4, 0.02, 0.2);
    const profile = getLightProfile(officeHour);
    targetColor.set(profile.color);
    if (directional.current) {
      directional.current.color.lerp(targetColor, blend);
      directional.current.intensity = MathUtils.lerp(directional.current.intensity, profile.intensity, blend);
    }
    if (ambient.current) {
      ambient.current.intensity = MathUtils.lerp(ambient.current.intensity, 0.42 + profile.intensity * 0.16, blend);
    }
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={0.58} color="#fff4e5" />
      <directionalLight
        ref={directional}
        position={[10, 15, 8]}
        color="#ffb347"
        intensity={1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
      />
    </>
  );
}
