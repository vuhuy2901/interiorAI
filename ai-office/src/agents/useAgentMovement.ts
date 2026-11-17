import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { MathUtils, Vector3, type Group } from 'three';

const WALK_SPEED = 1.8;
const ACCEL = 6.0;
const DECEL = 8.0;
const TURN_SPEED = 10.0;

export function useAgentMovement(target: Vector3, shouldMove: boolean) {
  const group = useRef<Group>(null);
  const velocity = useRef(0);
  const facing = useRef(0);
  const walking = useRef(false);
  const toTarget = useRef(new Vector3());
  const forward = useRef(new Vector3());

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const current = group.current;
    if (!current) return;

    if (!shouldMove) {
      velocity.current = MathUtils.lerp(velocity.current, 0, 0.15);
      if (velocity.current < 0.01) velocity.current = 0;
      walking.current = false;
      return;
    }

    toTarget.current.copy(target).sub(current.position);
    toTarget.current.y = 0;
    const distance = toTarget.current.length();
    const desiredYaw = Math.atan2(toTarget.current.x, toTarget.current.z);

    if (distance > 0.15) {
      const deltaYaw = Math.atan2(
        Math.sin(desiredYaw - facing.current),
        Math.cos(desiredYaw - facing.current),
      );
      facing.current += MathUtils.clamp(deltaYaw, -TURN_SPEED * dt, TURN_SPEED * dt);
      current.rotation.y = facing.current;
    }

    if (distance > 0.1) {
      velocity.current = Math.min(velocity.current + ACCEL * dt, WALK_SPEED);
    } else {
      velocity.current = Math.max(velocity.current - DECEL * dt, 0);
    }

    walking.current = velocity.current > 0.05;
    forward.current.set(Math.sin(facing.current), 0, Math.cos(facing.current));
    current.position.addScaledVector(forward.current, velocity.current * dt);
  });

  return { group, walking };
}
