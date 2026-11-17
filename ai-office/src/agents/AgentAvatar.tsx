import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { MathUtils, type Group, type Mesh, type PointLight, type Vector3 } from 'three';
import { agentConfigById, getAgentAnchor, type AgentConfig, type AgentStatus } from './agentConfig';
import { useAgentMovement } from './useAgentMovement';
import { useEventStore, type AgentTransitState } from '../events/useEventStore';

type AgentAvatarProps = {
  agent: AgentConfig;
  status: AgentStatus;
  task: string;
  overtime: boolean;
  target: Vector3;
  agentState: AgentTransitState;
  handoffTo: string | null;
  onSelect: (id: string) => void;
};

function hashId(id: string) {
  return id.split('').reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0) / 1000;
}

export function AgentAvatar({ agent, status, task, overtime, target, agentState, handoffTo, onSelect }: AgentAvatarProps) {
  const isTransit = agentState === 'walking' || agentState === 'handing' || agentState === 'returning';
  const { group, walking } = useAgentMovement(target, isTransit);
  const setAgentState = useEventStore((state) => state.setAgentState);
  const setAgentTarget = useEventStore((state) => state.setAgentTarget);
  const meetingPhase = useEventStore((state) => state.meetingPhase);
  const markMeetingArrival = useEventStore((state) => state.markMeetingArrival);
  const finishMeetingReturn = useEventStore((state) => state.finishMeetingReturn);
  const body = useRef<Mesh>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const icon = useRef<Mesh>(null);
  const light = useRef<PointLight>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const bubbleOpacity = useRef(0);
  const phase = useRef(0);
  const handoffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);
  const isSitting = useRef(false);

  useEffect(() => {
    if (!group.current || initialized.current) return;
    group.current.position.copy(getAgentAnchor(agent.id));
    initialized.current = true;
  }, [agent.homePos, agent.id, group]);

  useEffect(() => () => {
    if (handoffTimer.current) clearTimeout(handoffTimer.current);
  }, []);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = clock.elapsedTime + hashId(agent.id);
    const isWorking = status === 'working';
    const dxToAnchor = getAgentAnchor(agent.id).x - (group.current?.position.x ?? 0);
    const dzToAnchor = getAgentAnchor(agent.id).z - (group.current?.position.z ?? 0);
    const nearAnchor = Math.sqrt(dxToAnchor * dxToAnchor + dzToAnchor * dzToAnchor) < 0.2;
    isSitting.current = nearAnchor && !isTransit;
    const swing = walking.current ? Math.sin(phase.current) * 0.55 : 0;
    if (walking.current) phase.current += dt * 2.2 * Math.PI * 2;

    const typing = isWorking ? Math.sin(t * 18) * 0.12 : 0;
    const desiredLegL = isSitting.current ? -Math.PI / 2 : swing;
    const desiredLegR = isSitting.current ? -Math.PI / 2 : -swing;
    const desiredArmL = isSitting.current ? -0.8 + typing : -swing * 0.7;
    const desiredArmR = isSitting.current ? -0.8 - typing : swing * 0.7;
    const blend = 0.2;

    if (legL.current) legL.current.rotation.x = MathUtils.lerp(legL.current.rotation.x, desiredLegL, blend);
    if (legR.current) legR.current.rotation.x = MathUtils.lerp(legR.current.rotation.x, desiredLegR, blend);
    if (armL.current) armL.current.rotation.x = MathUtils.lerp(armL.current.rotation.x, desiredArmL, blend);
    if (armR.current) armR.current.rotation.x = MathUtils.lerp(armR.current.rotation.x, desiredArmR, blend);

    if (body.current) {
      const bobY = status === 'working' ? Math.sin(t * 6) * 0.02 : status === 'waiting' ? Math.sin(t * 2) * 0.01 : status === 'idle' ? Math.sin(t * 1.5) * 0.015 : 0;
      const bobX = status === 'blocked' ? Math.sin(t * 40) * 0.01 : 0;
      const tilt = status === 'working' ? -0.08 : status === 'waiting' ? 0.05 : 0;
      body.current.position.y = MathUtils.lerp(body.current.position.y, 0.98 + bobY, 0.12);
      body.current.position.x = MathUtils.lerp(body.current.position.x, bobX, 0.12);
      body.current.rotation.x = MathUtils.lerp(body.current.rotation.x, tilt, 0.12);
    }
    if (group.current) group.current.position.y = MathUtils.lerp(group.current.position.y, isSitting.current ? -0.35 : 0, 0.12);

    if (group.current) {
      const dx = target.x - group.current.position.x;
      const dz = target.z - group.current.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (meetingPhase === 'gathering' && agentState === 'walking' && distance < 0.5) {
        markMeetingArrival(agent.id);
      } else if (meetingPhase === 'returning' && agentState === 'walking' && distance < 0.5) {
        finishMeetingReturn(agent.id);
      } else if (meetingPhase === 'idle' && agentState === 'walking' && distance < 0.5 && !handoffTimer.current && handoffTo) {
        setAgentState(agent.id, 'handing');
        handoffTimer.current = setTimeout(() => {
          setAgentTarget(agent.id, getAgentAnchor(agent.id));
          setAgentState(agent.id, 'returning');
          handoffTimer.current = null;
        }, 1500);
      }
      if (agentState === 'returning' && distance < 0.5) setAgentState(agent.id, 'idle');
    }

    const shouldShowBubble = (status !== 'idle' && Boolean(task)) || agentState === 'handing';
    bubbleOpacity.current = MathUtils.lerp(bubbleOpacity.current, shouldShowBubble ? 1 : 0, 0.08);
    if (bubble.current) bubble.current.style.opacity = String(bubbleOpacity.current);
    if (icon.current && status === 'blocked') icon.current.rotation.y += dt * 1.6;
    if (light.current) light.current.intensity = MathUtils.lerp(light.current.intensity, overtime ? 1.5 : 0, 0.1);
  });

  const bubbleText = agentState === 'handing'
    ? `Bàn giao cho ${agentConfigById[handoffTo ?? '']?.name ?? 'người nhận'}`
    : status === 'blocked' ? `Blocked · ${task || 'Cần xử lý'}` : task;
  const bubbleBorder = agentState === 'handing' ? '#c08457' : status === 'blocked' ? '#ea580c' : status === 'waiting' ? '#d97706' : '#cbd5e1';
  const isCarrying = agentState === 'walking' || agentState === 'handing';

  return (
    <group ref={group} onClick={(event) => { event.stopPropagation(); onSelect(agent.id); }}>
      <pointLight ref={light} position={[0.6, 1.1, 0.4]} color="#ffb86b" distance={3} decay={2} intensity={0} />
      <mesh ref={body} position={[0, 0.98, 0]} castShadow>
        <capsuleGeometry args={[0.28, 0.9, 8, 16]} />
        <meshStandardMaterial color={agent.color} roughness={0.48} metalness={0.08} />
      </mesh>
      <mesh position={[0, 1.65, 0]} castShadow>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color="#fde2c8" roughness={0.78} />
      </mesh>
      <group ref={armL} position={[-0.32, 1.2, 0]}>
        <mesh position={[0, -0.3, 0]} castShadow>
          <capsuleGeometry args={[0.08, 0.5, 6, 10]} />
          <meshStandardMaterial color={agent.color} roughness={0.5} />
        </mesh>
        {agent.role === 'floor' && (
          <mesh position={[0, -0.31, 0.05]} castShadow>
            <boxGeometry args={[0.05, 0.4, 0.05]} />
            <meshStandardMaterial color="#facc15" roughness={0.55} />
          </mesh>
        )}
      </group>
      <group ref={armR} position={[0.32, 1.2, 0]}>
        <mesh position={[0, -0.3, 0]} castShadow>
          <capsuleGeometry args={[0.08, 0.5, 6, 10]} />
          <meshStandardMaterial color={agent.color} roughness={0.5} />
        </mesh>
        {agent.role === 'chief_architect' && (
          <mesh position={[0, -0.3, 0.06]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 0.4, 12]} />
            <meshStandardMaterial color="#fff7ed" roughness={0.8} />
          </mesh>
        )}
      </group>
      <group ref={legL} position={[-0.14, 0.5, 0]}>
        <mesh position={[0, -0.25, 0]} castShadow>
          <capsuleGeometry args={[0.09, 0.45, 6, 10]} />
          <meshStandardMaterial color="#1e293b" roughness={0.62} />
        </mesh>
      </group>
      <group ref={legR} position={[0.14, 0.5, 0]}>
        <mesh position={[0, -0.25, 0]} castShadow>
          <capsuleGeometry args={[0.09, 0.45, 6, 10]} />
          <meshStandardMaterial color="#1e293b" roughness={0.62} />
        </mesh>
      </group>
      {isCarrying && (
        <group position={[0, 1.0, 0.4]}>
          <mesh castShadow>
            <boxGeometry args={[0.26, 0.2, 0.08]} />
            <meshStandardMaterial color="#fffaf0" roughness={0.75} />
          </mesh>
          <mesh position={[0, 0, 0.042]}>
            <boxGeometry args={[0.06, 0.2, 0.002]} />
            <meshBasicMaterial color="#c08457" />
          </mesh>
        </group>
      )}
      {agent.role === 'qa' && (
        <mesh position={[0, 1.63, 0.24]} castShadow>
          <torusGeometry args={[0.08, 0.02, 8, 20]} />
          <meshStandardMaterial color="#1f2937" roughness={0.6} />
        </mesh>
      )}
      <Html position={[0, 2.1, 0]} center distanceFactor={8}>
        <div className="agent-nameplate" style={{ borderColor: agent.color }}>
          <span className="agent-name-dot" style={{ background: agent.color }} />
          {agent.name} · {agent.roleLabel}
        </div>
      </Html>
      <Html position={[0, 2.5, 0]} center distanceFactor={8}>
        <div ref={bubble} className="agent-task-bubble" style={{ borderColor: bubbleBorder }}>
          {bubbleText || status}
        </div>
      </Html>
      {status === 'blocked' && (
        <mesh ref={icon} position={[0, 2.95, 0]} castShadow>
          <octahedronGeometry args={[0.15, 0]} />
          <meshStandardMaterial color="#ea580c" emissive="#9a3412" emissiveIntensity={0.8} />
        </mesh>
      )}
      {status === 'working' && (
        <mesh position={[0, 2.95, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.12, 0.03, 8, 24]} />
          <meshStandardMaterial color="#38bdf8" emissive="#0369a1" emissiveIntensity={1.7} />
        </mesh>
      )}
    </group>
  );
}
