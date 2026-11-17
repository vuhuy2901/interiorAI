import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Vector3 } from 'three';
import { agentConfigs, getAgentPosition } from './agents/agentConfig';
import { EventBridge } from './events/EventBridge';
import { useEventStore } from './events/useEventStore';
import { CameraRig } from './office/CameraRig';
import { OfficeScene } from './office/OfficeScene';
import { AgentPanel } from './ui/AgentPanel';
import { TodayStats } from './ui/TodayStats';

function App() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [officeHour, setOfficeHour] = useState(9);
  const bridgeRef = useRef<EventBridge | null>(null);
  const applyEvent = useEventStore((state) => state.applyEvent);
  const stats = useEventStore((state) => state.stats);
  const overtime = useEventStore((state) => state.overtime);
  const focusTarget = useMemo(() => selectedAgent ? getAgentPosition(selectedAgent) : null, [selectedAgent]);

  useEffect(() => {
    const bridge = new EventBridge(undefined, true);
    bridgeRef.current = bridge;
    const unsubscribe = bridge.onEvent(applyEvent);
    bridge.connect();
    return () => {
      unsubscribe();
      bridge.disconnect();
      bridgeRef.current = null;
    };
  }, [applyEvent]);

  const stepTime = () => setOfficeHour((current) => (current + 2) % 24);

  return (
    <main className="app-shell">
      <Canvas
        className="scene-canvas"
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 12, 14], fov: 50, near: 0.1, far: 100 }}
        onPointerMissed={() => setSelectedAgent(null)}
      >
        <CameraRig focusTarget={focusTarget} />
        <OfficeScene officeHour={officeHour} overtime={overtime} onSelect={setSelectedAgent} />
      </Canvas>

      <div className="ui-layer">
        <header className="topbar">
          <div className="brand-lockup">
            <div className="brand-glyph"><span /><span /><span /></div>
            <div><p className="eyebrow">ATELIER CONTROL / SIMULATION</p><h1>AI OFFICE <em>03</em></h1></div>
          </div>
          <div className="topbar-actions">
            <div className="live-indicator"><span /> MOCK EVENT STREAM / LIVE</div>
            <button className="time-button" onClick={stepTime}>Tua +2h <span>{String(officeHour).padStart(2, '0')}:00</span></button>
          </div>
        </header>
        <TodayStats {...stats} overtime={overtime} />
        <div className="office-caption"><span className="caption-line" /><span>BEDROOM KID / 3×4M / 40TR</span><span className="caption-line" /></div>
        <div className="role-legend">
          <span className="legend-title">AGENTS / 09</span>
          {agentConfigs.slice(0, 5).map((agent) => <span key={agent.id} className="legend-item"><i style={{ background: agent.color }} />{agent.roleLabel}</span>)}
        </div>
        <div className="hint-card"><span className="hint-key">CLICK</span> chọn agent <span className="hint-key">DRAG</span> orbit scene</div>
      </div>
      <AgentPanel selectedAgent={selectedAgent} onClose={() => setSelectedAgent(null)} />
    </main>
  );
}

export default App;
