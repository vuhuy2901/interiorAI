import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { MathUtils, Vector3 } from 'three';

type CameraRigProps = { focusTarget: Vector3 | null };

export function CameraRig({ focusTarget }: CameraRigProps) {
  const { camera } = useThree();
  const controls = useRef<any>(null);
  const desiredPos = useRef(new Vector3(0, 12, 14));
  const desiredLook = useRef(new Vector3(0, 0, 0));

  useEffect(() => {
    if (focusTarget) {
      desiredPos.current.copy(focusTarget).add(new Vector3(3, 4, 4));
      desiredLook.current.copy(focusTarget).add(new Vector3(0, 1, 0));
    } else {
      desiredPos.current.set(0, 12, 14);
      desiredLook.current.set(0, 0, 0);
    }
  }, [focusTarget]);

  useFrame((_, rawDt) => {
    if (!camera || !controls.current) return;
    const dt = Math.min(rawDt, 0.05);
    const blend = MathUtils.clamp(dt * 4, 0.02, 0.2);
    controls.current.target.lerp(desiredLook.current, blend);
    camera.position.lerp(desiredPos.current, blend);
    controls.current.update();
  });

  return (
    <OrbitControls
      ref={controls}
      enableDamping
      dampingFactor={0.08}
      maxPolarAngle={Math.PI / 2.2}
      minDistance={5}
      maxDistance={30}
      makeDefault
    />
  );
}
