import { ContactShadows } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { MathUtils, type Mesh, type MeshStandardMaterial } from 'three';
import { agentConfigs, type AgentStatus } from '../agents/agentConfig';
import { AgentAvatar } from '../agents/AgentAvatar';
import { useEventStore } from '../events/useEventStore';
import { BlueprintWall } from './BlueprintWall';
import { MaterialBoard } from './MaterialBoard';
import { MiniRoom } from './MiniRoom';
import { TimeLighting } from './TimeLighting';

type OfficeSceneProps = {
  officeHour: number;
  overtime: boolean;
  onSelect: (id: string) => void;
};

function WorkstationMonitor({ working }: { working: boolean }) {
  const material = useRef<MeshStandardMaterial>(null);
  const spinner = useRef<Mesh>(null);
  const spinnerMaterial = useRef<MeshStandardMaterial>(null);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    if (material.current) material.current.emissiveIntensity = MathUtils.lerp(material.current.emissiveIntensity, working ? 1.5 : 0, 0.12);
    if (spinner.current) {
      spinner.current.rotation.y += dt * 3.2;
      const scale = working ? 1 : 0.001;
      spinner.current.scale.x = MathUtils.lerp(spinner.current.scale.x, scale, 0.12);
      spinner.current.scale.y = MathUtils.lerp(spinner.current.scale.y, scale, 0.12);
      spinner.current.scale.z = MathUtils.lerp(spinner.current.scale.z, scale, 0.12);
    }
    if (spinnerMaterial.current) spinnerMaterial.current.opacity = MathUtils.lerp(spinnerMaterial.current.opacity, working ? 1 : 0, 0.12);
  });

  return (
    <group position={[0, 1.05, -0.18]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.5, 0.05]} />
        <meshStandardMaterial ref={material} color="#111827" emissive="#60a5fa" emissiveIntensity={0} roughness={0.55} />
      </mesh>
      <mesh ref={spinner} position={[0, 0.38, 0.02]} castShadow scale={[0.001, 0.001, 0.001]}>
        <boxGeometry args={[0.12, 0.12, 0.12]} />
        <meshStandardMaterial ref={spinnerMaterial} color="#fef08a" emissive="#fbbf24" emissiveIntensity={1.5} transparent opacity={0} />
      </mesh>
    </group>
  );
}

function Chair({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  const legs: Array<[number, number, number]> = [
    [-0.23, 0.2, -0.23], [0.23, 0.2, -0.23], [-0.23, 0.2, 0.23], [0.23, 0.2, 0.23],
  ];
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 0.1, 0.6]} />
        <meshStandardMaterial color="#b8a08a" roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.9, -0.25]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 0.8, 0.1]} />
        <meshStandardMaterial color="#9b826c" roughness={0.84} />
      </mesh>
      {legs.map((leg, index) => (
        <mesh key={index} position={leg} castShadow receiveShadow>
          <cylinderGeometry args={[0.04, 0.04, 0.4, 10]} />
          <meshStandardMaterial color="#765b49" roughness={0.88} />
        </mesh>
      ))}
    </group>
  );
}

function Desk({ position, color, working }: { position: [number, number, number]; color: string; working: boolean }) {
  const legPositions: Array<[number, number, number]> = [
    [-0.62, 0.28, -0.26],
    [0.62, 0.28, -0.26],
    [-0.62, 0.28, 0.26],
    [0.62, 0.28, 0.26],
  ];
  return (
    <group position={position}>
      <mesh position={[0, 0.68, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.18, 0.75]} />
        <meshStandardMaterial color="#a47551" roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.8, -0.16]} castShadow>
        <boxGeometry args={[0.7, 0.04, 0.05]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <WorkstationMonitor working={working} />
      {legPositions.map((leg, index) => (
        <mesh key={index} position={leg} castShadow>
          <boxGeometry args={[0.08, 0.56, 0.08]} />
          <meshStandardMaterial color="#7c5039" roughness={0.86} />
        </mesh>
      ))}
      <mesh position={[0.5, 0.82, 0.14]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.11, 16]} />
        <meshStandardMaterial color="#fffaf0" roughness={0.7} />
      </mesh>
      <mesh position={[-0.38, 0.8, 0.14]} castShadow>
        <boxGeometry args={[0.22, 0.04, 0.18]} />
        <meshStandardMaterial color="#fffdf8" roughness={0.8} />
      </mesh>
    </group>
  );
}

function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.26, 0]} castShadow>
        <cylinderGeometry args={[0.34, 0.42, 0.52, 16]} />
        <meshStandardMaterial color="#9a5b3d" roughness={0.86} />
      </mesh>
      <mesh position={[0, 0.98, 0]} castShadow>
        <sphereGeometry args={[0.72, 16, 12]} />
        <meshStandardMaterial color="#22c55e" roughness={0.9} />
      </mesh>
      <mesh position={[0.4, 0.84, 0.05]} castShadow>
        <sphereGeometry args={[0.36, 12, 10]} />
        <meshStandardMaterial color="#16a34a" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Walkway({ position, size }: { position: [number, number, number]; size: [number, number, number] }) {
  return (
    <mesh position={position} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color="#d8bd91" roughness={0.92} metalness={0.02} />
    </mesh>
  );
}

function OfficeWalkways() {
  return (
    <group>
      <Walkway position={[0, 0.018, -6.1]} size={[1.45, 0.035, 7.8]} />
      <Walkway position={[0, 0.018, 6.1]} size={[1.45, 0.035, 7.8]} />
      <Walkway position={[-6.1, 0.018, 0]} size={[7.8, 0.035, 1.45]} />
      <Walkway position={[6.1, 0.018, 0]} size={[7.8, 0.035, 1.45]} />
      <mesh position={[0, 0.022, 0]} receiveShadow>
        <boxGeometry args={[2.2, 0.04, 2.2]} />
        <meshStandardMaterial color="#c9a77a" roughness={0.9} />
      </mesh>
      <mesh position={[-3.5, 0.022, -4.55]} receiveShadow>
        <boxGeometry args={[5.2, 0.04, 1.15]} />
        <meshStandardMaterial color="#d8bd91" roughness={0.92} />
      </mesh>
      <mesh position={[4.85, 0.022, -5.05]} receiveShadow>
        <boxGeometry args={[5.1, 0.04, 1.15]} />
        <meshStandardMaterial color="#d8bd91" roughness={0.92} />
      </mesh>
      <mesh position={[-3.65, 0.022, 5.6]} receiveShadow>
        <boxGeometry args={[4.7, 0.04, 1.15]} />
        <meshStandardMaterial color="#d8bd91" roughness={0.92} />
      </mesh>
      <mesh position={[5.55, 0.022, 6.1]} receiveShadow>
        <boxGeometry args={[5.3, 0.04, 1.15]} />
        <meshStandardMaterial color="#d8bd91" roughness={0.92} />
      </mesh>
    </group>
  );
}

function MaquetteTable() {
  return (
    <group position={[-5, 0.6, 5]}>
      <mesh position={[0, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[4, 0.8, 3]} />
        <meshStandardMaterial color="#b7e3e8" transparent opacity={0.3} roughness={0.18} metalness={0.08} />
      </mesh>
      {[[-1.55, -1.05], [1.55, -1.05], [-1.55, 1.05], [1.55, 1.05]].map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, -0.65, z]} castShadow>
          <boxGeometry args={[0.14, 1.3, 0.14]} />
          <meshStandardMaterial color="#8b5a2b" roughness={0.82} />
        </mesh>
      ))}
      <MiniRoom />
      <mesh position={[-1.25, 0.56, 0.75]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.45, 14]} />
        <meshStandardMaterial color="#fff7ed" roughness={0.72} />
      </mesh>
      <mesh position={[1.25, 0.56, 0.72]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.45, 14]} />
        <meshStandardMaterial color="#f5c2c7" roughness={0.72} />
      </mesh>
      <mesh position={[1.18, 0.56, -0.72]} castShadow>
        <boxGeometry args={[0.42, 0.04, 0.3]} />
        <meshStandardMaterial color="#f5f5dc" roughness={0.78} />
      </mesh>
    </group>
  );
}

function MeetingTable() {
  return (
    <group>
      <mesh position={[5, 0.6, -5]} scale={[2.1, 1, 1.25]} castShadow receiveShadow>
        <cylinderGeometry args={[1, 1, 0.18, 32]} />
        <meshStandardMaterial color="#a47551" roughness={0.8} />
      </mesh>
      <mesh position={[5, -0.02, -5]} castShadow>
        <cylinderGeometry args={[0.34, 0.42, 1.25, 16]} />
        <meshStandardMaterial color="#7c5039" roughness={0.86} />
      </mesh>
      {agentConfigs.map((agent) => {
        const [x, , z] = agent.meetingPos;
        const angle = Math.atan2(z + 5, x - 5);
        return <Chair key={agent.id} position={[x, 0, z]} rotationY={angle + Math.PI} />;
      })}
    </group>
  );
}

function ChiefWhiteboard() {
  return (
    <group position={[-5, 2.25, -9.78]}>
      <mesh position={[0, 0, -0.03]} castShadow receiveShadow>
        <boxGeometry args={[2.7, 1.45, 0.05]} />
        <meshStandardMaterial color="#1f2937" roughness={0.58} />
      </mesh>
      <mesh position={[0, 0, 0.01]} castShadow receiveShadow>
        <planeGeometry args={[2.5, 1.25]} />
        <meshStandardMaterial color="#ffffff" roughness={0.82} />
      </mesh>
      <mesh position={[-0.65, 0.16, 0.03]}>
        <boxGeometry args={[0.8, 0.025, 0.02]} />
        <meshBasicMaterial color="#60a5fa" />
      </mesh>
      <mesh position={[-0.25, -0.05, 0.03]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[0.45, 0.025, 0.02]} />
        <meshBasicMaterial color="#60a5fa" />
      </mesh>
    </group>
  );
}

function EngineeringRack() {
  return (
    <group position={[8.35, 0, 7.3]}>
      <mesh position={[0, 1.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.25, 0.08, 2.1]} />
        <meshStandardMaterial color="#475569" roughness={0.78} />
      </mesh>
      <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.25, 0.08, 2.1]} />
        <meshStandardMaterial color="#475569" roughness={0.78} />
      </mesh>
      {[-0.62, 0.62].map((x) => <mesh key={x} position={[x, 0.7, 0]} castShadow><boxGeometry args={[0.08, 1.45, 0.08]} /><meshStandardMaterial color="#475569" roughness={0.78} /></mesh>)}
      {[0.35, 0.9].map((y) => <mesh key={y} position={[0, y, 0]} castShadow receiveShadow><boxGeometry args={[1.2, 0.06, 2.05]} /><meshStandardMaterial color="#64748b" roughness={0.8} /></mesh>)}
      {[[-0.3, 0.57, -0.55], [0.3, 0.57, 0.45], [-0.28, 1.13, 0.15], [0.3, 1.13, -0.55]].map(([x, y, z], index) => <mesh key={index} position={[x, y, z]} castShadow><boxGeometry args={[0.42, 0.32, 0.42]} /><meshStandardMaterial color={index % 2 ? '#c08457' : '#d4a373'} roughness={0.86} /></mesh>)}
    </group>
  );
}

function BomScreen() {
  return (
    <group position={[0.12, 2.2, 5.7]} rotation={[0, Math.PI / 2, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.08, 1.35, 2.25]} />
        <meshStandardMaterial color="#334155" roughness={0.55} />
      </mesh>
      <mesh position={[0.045, 0, 0]} castShadow>
        <boxGeometry args={[0.02, 1.1, 2]} />
        <meshStandardMaterial color="#111827" emissive="#60a5fa" emissiveIntensity={0.65} roughness={0.45} />
      </mesh>
    </group>
  );
}

export function OfficeScene({ officeHour, overtime, onSelect }: OfficeSceneProps) {
  const agents = useEventStore((state) => state.agents);
  const agentTargets = useEventStore((state) => state.agentTargets);
  const agentStates = useEventStore((state) => state.agentStates);
  const meetingPhase = useEventStore((state) => state.meetingPhase);
  const advanceMeeting = useEventStore((state) => state.advanceMeeting);
  const floorDecor = useMemo(() => [
    [-8.4, 0.05, -8.4], [8.4, 0.05, 8.4],
  ] as Array<[number, number, number]>, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    if (meetingPhase === 'in_progress') advanceMeeting(dt);
  });

  return (
    <>
      <color attach="background" args={["#f5eadf"]} />
      <fog attach="fog" args={["#f5eadf", 17, 30]} />
      <TimeLighting officeHour={officeHour} />
      <mesh position={[0, 2.5, -9.9]} castShadow receiveShadow>
        <boxGeometry args={[20, 5, 0.2]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.9} />
      </mesh>
      <mesh position={[-9.9, 2.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.2, 5, 20]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.9} />
      </mesh>
      <mesh position={[-6.1, 0.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[7.8, 1.5, 0.16]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.9} />
      </mesh>
      <mesh position={[6.1, 0.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[7.8, 1.5, 0.16]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.75, -6.1]} castShadow receiveShadow>
        <boxGeometry args={[0.16, 1.5, 7.8]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.75, 6.1]} castShadow receiveShadow>
        <boxGeometry args={[0.16, 1.5, 7.8]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.9} />
      </mesh>
      <BlueprintWall />
      <MaterialBoard />
      <ChiefWhiteboard />
      <mesh position={[0, -0.1, 0]} receiveShadow>
        <boxGeometry args={[20, 0.2, 20]} />
        <meshStandardMaterial color="#5c4033" roughness={0.8} />
      </mesh>
      <OfficeWalkways />
      <ContactShadows position={[0, 0.01, 0]} opacity={0.4} scale={20} blur={2.5} far={4} resolution={1024} color="#2f211b" />
      <MaquetteTable />
      <MeetingTable />
      <EngineeringRack />
      <BomScreen />
      {floorDecor.map((position, index) => <Plant key={index} position={position} />)}
      {agentConfigs.map((agent) => {
        const status = (agents[agent.id]?.status ?? 'idle') as AgentStatus;
        return (
          <group key={agent.id}>
            <Desk position={agent.deskPos} color={agent.color} working={status === 'working'} />
            <Chair position={agent.homePos} />
            <AgentAvatar
              agent={agent}
              status={status}
              task={agents[agent.id]?.task ?? ''}
              overtime={overtime}
              target={agentTargets[agent.id]}
              agentState={agentStates[agent.id] ?? 'idle'}
              handoffTo={agents[agent.id]?.handoff_to ?? null}
              onSelect={onSelect}
            />
          </group>
        );
      })}
    </>
  );
}
