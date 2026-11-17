import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { MathUtils, type Group, type PointLight, type MeshStandardMaterial } from 'three';
import { useEventStore } from '../events/useEventStore';

export function MiniRoom() {
  const group = useRef<Group>(null);
  const floorMaterial = useRef<MeshStandardMaterial>(null);
  const furnitureGroup = useRef<Group>(null);
  const furnitureMaterial = useRef<MeshStandardMaterial>(null);
  const pointLight = useRef<PointLight>(null);
  const floorWorking = useEventStore((state) => state.agents['agent-02']?.status === 'working');
  const furnitureWorking = useEventStore((state) => state.agents['agent-03']?.status === 'working');
  const lightingWorking = useEventStore((state) => state.agents['agent-04']?.status === 'working');

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const active = floorWorking || furnitureWorking || lightingWorking;
    const targetOpacity = active ? 1 : 0;
    const furnitureOpacity = furnitureWorking ? 1 : 0;
    if (group.current) {
      const targetScale = active ? 1 : 0.001;
      group.current.scale.x = MathUtils.lerp(group.current.scale.x, targetScale, 0.12);
      group.current.scale.y = MathUtils.lerp(group.current.scale.y, targetScale, 0.12);
      group.current.scale.z = MathUtils.lerp(group.current.scale.z, targetScale, 0.12);
    }
    if (floorMaterial.current) floorMaterial.current.opacity = MathUtils.lerp(floorMaterial.current.opacity, targetOpacity, 0.12);
    if (furnitureMaterial.current) furnitureMaterial.current.opacity = MathUtils.lerp(furnitureMaterial.current.opacity, furnitureOpacity, 0.12);
    if (furnitureGroup.current) {
      furnitureGroup.current.scale.x = MathUtils.lerp(furnitureGroup.current.scale.x, furnitureWorking ? 1 : 0.001, 0.12);
      furnitureGroup.current.scale.y = MathUtils.lerp(furnitureGroup.current.scale.y, furnitureWorking ? 1 : 0.001, 0.12);
      furnitureGroup.current.scale.z = MathUtils.lerp(furnitureGroup.current.scale.z, furnitureWorking ? 1 : 0.001, 0.12);
    }
    if (pointLight.current) pointLight.current.intensity = MathUtils.lerp(pointLight.current.intensity, lightingWorking ? 1.4 : 0, 0.1);
  });

  return (
    <group ref={group} position={[0, 0.44, 0]} scale={[0.001, 0.001, 0.001]}>
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <boxGeometry args={[2.5, 0.06, 1.8]} />
        <meshStandardMaterial ref={floorMaterial} color="#dbeafe" emissive="#60a5fa" emissiveIntensity={0.5} transparent opacity={0} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.08, -0.88]} castShadow receiveShadow>
        <boxGeometry args={[2.5, 0.06, 0.05]} />
        <meshStandardMaterial color="#60a5fa" emissive="#2563eb" emissiveIntensity={1.1} />
      </mesh>
      <mesh position={[-1.22, 0.08, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.05, 0.06, 1.8]} />
        <meshStandardMaterial color="#60a5fa" emissive="#2563eb" emissiveIntensity={1.1} />
      </mesh>
      <group ref={furnitureGroup} scale={[0.001, 0.001, 0.001]}>
        <mesh position={[-0.45, 0.24, 0.2]} castShadow>
          <boxGeometry args={[0.95, 0.36, 0.62]} />
          <meshStandardMaterial ref={furnitureMaterial} color="#fecdd3" transparent opacity={0} roughness={0.75} />
        </mesh>
        <mesh position={[0.65, 0.22, -0.26]} castShadow>
          <boxGeometry args={[0.5, 0.32, 0.48]} />
          <meshStandardMaterial color="#d4a373" roughness={0.82} />
        </mesh>
        <mesh position={[0.62, 0.17, 0.42]} castShadow>
          <boxGeometry args={[0.7, 0.22, 0.34]} />
          <meshStandardMaterial color="#bfdbfe" roughness={0.78} />
        </mesh>
      </group>
      <pointLight ref={pointLight} position={[0, 0.5, 0]} color="#ffcf8a" distance={3} decay={2} intensity={0} />
    </group>
  );
}
