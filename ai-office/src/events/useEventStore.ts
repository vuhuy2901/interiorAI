import { create } from 'zustand';
import { Vector3 } from 'three';
import {
  agentConfigs,
  agentConfigById,
  getAgentAnchor,
  getAgentPosition,
  getMeetingPosition,
  type AgentStatus,
} from '../agents/agentConfig';
import { type OfficeEvent } from './EventBridge';

export type AgentTransitState = 'idle' | 'walking' | 'handing' | 'returning';
export type MeetingPhase = 'idle' | 'gathering' | 'in_progress' | 'returning';

export type AgentState = {
  status: AgentStatus;
  task: string;
  file: string;
  tokens_used: number;
  cost_usd: number;
  handoff_to: string | null;
  history: OfficeEvent[];
};

type MeetingResume = Record<string, { status: AgentStatus; task: string; file: string }>;

type StoreState = {
  agents: Record<string, AgentState>;
  stats: { done: number; blocked: number; tokens: number; cost: number };
  overtime: boolean;
  lastEvent: OfficeEvent | null;
  workingStreak: number;
  agentTargets: Record<string, Vector3>;
  agentStates: Record<string, AgentTransitState>;
  meetingPhase: MeetingPhase;
  meetingElapsed: number;
  meetingArrivals: Record<string, boolean>;
  meetingReturns: Record<string, boolean>;
  meetingResume: MeetingResume;
  applyEvent: (event: OfficeEvent) => void;
  setAgentState: (agentId: string, transitState: AgentTransitState) => void;
  setAgentTarget: (agentId: string, target: Vector3) => void;
  markMeetingArrival: (agentId: string) => void;
  advanceMeeting: (dt: number) => void;
  finishMeetingReturn: (agentId: string) => void;
};

const initialAgents = Object.fromEntries(
  agentConfigs.map((agent) => [agent.id, { status: 'idle', task: '', file: '', tokens_used: 0, cost_usd: 0, handoff_to: null, history: [] }]),
) as Record<string, AgentState>;
const initialAgentTargets = Object.fromEntries(agentConfigs.map((agent) => [agent.id, getAgentAnchor(agent.id)]));
const initialAgentStates = Object.fromEntries(agentConfigs.map((agent) => [agent.id, 'idle'])) as Record<string, AgentTransitState>;

function isMeetingEvent(event: OfficeEvent) {
  return event.task === 'Họp giao ban' && agentConfigById[event.agent_id]?.role === 'chief_architect';
}

export const useEventStore = create<StoreState>((set) => ({
  agents: initialAgents,
  stats: { done: 0, blocked: 0, tokens: 0, cost: 0 },
  overtime: false,
  lastEvent: null,
  workingStreak: 0,
  agentTargets: initialAgentTargets,
  agentStates: initialAgentStates,
  meetingPhase: 'idle',
  meetingElapsed: 0,
  meetingArrivals: {},
  meetingReturns: {},
  meetingResume: {},

  applyEvent: (event) => set((state) => {
    const current = state.agents[event.agent_id] ?? { status: 'idle', task: '', file: '', tokens_used: 0, cost_usd: 0, handoff_to: null, history: [] };
    const history = [...current.history, event].slice(-50);
    const workingStreak = event.status === 'working' ? state.workingStreak + 1 : 0;
    const nextAgents = {
      ...state.agents,
      [event.agent_id]: {
        status: event.status,
        task: event.task,
        file: event.file,
        tokens_used: current.tokens_used + event.tokens_used,
        cost_usd: current.cost_usd + event.cost_usd,
        handoff_to: event.handoff_to,
        history,
      },
    };
    const nextAgentTargets = { ...state.agentTargets };
    const nextAgentStates = { ...state.agentStates };
    let meetingPhase = state.meetingPhase;
    let meetingElapsed = state.meetingElapsed;
    let meetingArrivals = state.meetingArrivals;
    let meetingReturns = state.meetingReturns;
    let meetingResume = state.meetingResume;

    if (isMeetingEvent(event)) {
      meetingPhase = 'gathering';
      meetingElapsed = 0;
      meetingArrivals = {};
      meetingReturns = {};
      meetingResume = Object.fromEntries(agentConfigs.map((agent) => {
        const previous = state.agents[agent.id];
        return [agent.id, {
          status: previous?.status ?? 'working',
          task: previous?.task ?? 'Tiếp tục tại bàn',
          file: previous?.file ?? '',
        }];
      }));
      agentConfigs.forEach((agent) => {
        nextAgentTargets[agent.id] = getMeetingPosition(agent.id);
        nextAgentStates[agent.id] = 'walking';
      });
    } else if (event.handoff_to && agentConfigById[event.handoff_to] && state.meetingPhase === 'idle') {
      nextAgentTargets[event.agent_id] = getAgentPosition(event.handoff_to);
      nextAgentStates[event.agent_id] = 'walking';
    }

    return {
      agents: nextAgents,
      stats: {
        done: state.stats.done + (event.status === 'done' ? 1 : 0),
        blocked: state.stats.blocked + (event.status === 'blocked' && event.role === 'qa' ? 1 : 0),
        tokens: state.stats.tokens + event.tokens_used,
        cost: state.stats.cost + event.cost_usd,
      },
      overtime: workingStreak > 5,
      workingStreak,
      lastEvent: event,
      agentTargets: nextAgentTargets,
      agentStates: nextAgentStates,
      meetingPhase,
      meetingElapsed,
      meetingArrivals,
      meetingReturns,
      meetingResume,
    };
  }),

  setAgentState: (agentId, transitState) => set((state) => ({ agentStates: { ...state.agentStates, [agentId]: transitState } })),
  setAgentTarget: (agentId, target) => set((state) => ({ agentTargets: { ...state.agentTargets, [agentId]: target.clone() } })),

  markMeetingArrival: (agentId) => set((state) => {
    if (state.meetingPhase !== 'gathering') return state;
    const arrivals = { ...state.meetingArrivals, [agentId]: true };
    const allArrived = agentConfigs.every((agent) => arrivals[agent.id]);
    const stoppedStates = { ...state.agentStates, [agentId]: 'idle' as AgentTransitState };
    if (!allArrived) return { meetingArrivals: arrivals, agentStates: stoppedStates };

    const meetingAgents = { ...state.agents };
    agentConfigs.forEach((agent) => {
      const previous = meetingAgents[agent.id];
      meetingAgents[agent.id] = {
        ...previous,
        status: agent.role === 'chief_architect' ? 'working' : 'waiting',
        task: agent.role === 'chief_architect' ? 'Phổ biến dự án phòng ngủ trẻ em' : 'Đang nghe...',
      };
    });
    return {
      meetingArrivals: arrivals,
      meetingPhase: 'in_progress' as MeetingPhase,
      meetingElapsed: 0,
      agents: meetingAgents,
      agentStates: Object.fromEntries(agentConfigs.map((agent) => [agent.id, 'idle'])) as Record<string, AgentTransitState>,
    };
  }),

  advanceMeeting: (dt) => set((state) => {
    if (state.meetingPhase !== 'in_progress') return state;
    const elapsed = state.meetingElapsed + Math.min(dt, 0.05);
    if (elapsed < 4) return { meetingElapsed: elapsed };
    const targets = Object.fromEntries(agentConfigs.map((agent) => [agent.id, getAgentAnchor(agent.id)]));
    const walkingStates = Object.fromEntries(agentConfigs.map((agent) => [agent.id, 'walking'])) as Record<string, AgentTransitState>;
    return {
      meetingPhase: 'returning' as MeetingPhase,
      meetingElapsed: 4,
      meetingReturns: {},
      agentTargets: targets,
      agentStates: walkingStates,
      agents: {
        ...state.agents,
        'agent-01': { ...state.agents['agent-01'], status: 'idle', task: 'Quay về phòng Chief' },
      },
    };
  }),

  finishMeetingReturn: (agentId) => set((state) => {
    if (state.meetingPhase !== 'returning') return state;
    const returns = { ...state.meetingReturns, [agentId]: true };
    const nextStates = { ...state.agentStates, [agentId]: 'idle' as AgentTransitState };
    const allReturned = agentConfigs.every((agent) => returns[agent.id]);
    if (!allReturned) return { meetingReturns: returns, agentStates: nextStates };

    const restoredAgents = { ...state.agents };
    agentConfigs.forEach((agent) => {
      const resume = state.meetingResume[agent.id];
      const current = restoredAgents[agent.id];
      restoredAgents[agent.id] = {
        ...current,
        status: resume?.status === 'idle' || resume?.status === 'done' ? 'working' : resume?.status ?? 'working',
        task: resume?.task || 'Tiếp tục công việc tại bàn',
        file: resume?.file ?? current.file,
      };
    });
    return {
      meetingPhase: 'idle' as MeetingPhase,
      meetingElapsed: 0,
      meetingArrivals: {},
      meetingReturns: returns,
      meetingResume: {},
      agents: restoredAgents,
      agentStates: nextStates,
    };
  }),
}));

export function getDisplayAgentState(agentId: string, agents: Record<string, AgentState>): AgentState {
  return agents[agentId] ?? { status: 'idle', task: '', file: '', tokens_used: 0, cost_usd: 0, handoff_to: null, history: [] };
}

export function getAgentRoleLabel(agentId: string) {
  return agentConfigById[agentId]?.roleLabel ?? 'Agent';
}
