import { Vector3 } from 'three';

export type AgentStatus = 'idle' | 'working' | 'waiting' | 'blocked' | 'done';
export type AgentRole =
  | 'chief_architect'
  | 'floor'
  | 'furniture'
  | 'geometry_bim'
  | 'lighting'
  | 'sourcing'
  | 'inventory'
  | 'cost_bom'
  | 'qa';
export type OfficeZone = 'chief' | 'meeting' | 'design' | 'engineering';

export type AgentConfig = {
  id: string;
  name: string;
  role: AgentRole;
  roleLabel: string;
  color: string;
  zone: OfficeZone;
  deskPos: [number, number, number];
  homePos: [number, number, number];
  meetingPos: [number, number, number];
};

const roleLabels: Record<AgentRole, string> = {
  chief_architect: 'Chief Architect',
  floor: 'Floor Planner',
  furniture: 'Furniture',
  geometry_bim: 'Geometry BIM',
  lighting: 'Lighting',
  sourcing: 'Sourcing',
  inventory: 'Inventory',
  cost_bom: 'Cost / BOM',
  qa: 'QA Lead',
};

export const ROLE_COLORS: Record<AgentRole, string> = {
  chief_architect: '#fbcfe8',
  floor: '#bfdbfe',
  furniture: '#fecdd3',
  geometry_bim: '#ddd6fe',
  lighting: '#fef08a',
  sourcing: '#bbf7d0',
  inventory: '#c7d2fe',
  cost_bom: '#fca5a5',
  qa: '#cbd5e1',
};

const definitions: Array<[
  AgentRole,
  string,
  OfficeZone,
  [number, number, number],
  [number, number, number],
  [number, number, number],
]> = [
  ['chief_architect', 'Mira', 'chief', [-5, 0, -5], [-5, 0, -4.1], [5, 0, -6.8]],
  ['floor', 'An', 'design', [-7, 0, 5], [-7, 0, 5.9], [3.8, 0, -6.1]],
  ['furniture', 'Bao', 'design', [-5, 0, 6], [-5, 0, 6.9], [6.2, 0, -6.1]],
  // Keep the original mock-event IDs stable while assigning the new zone coordinates by role.
  ['lighting', 'Nhi', 'design', [-3, 0, 5], [-3, 0, 5.9], [3.4, 0, -5]],
  ['sourcing', 'Duy', 'engineering', [3, 0, 5], [3, 0, 5.9], [3.4, 0, -3.8]],
  ['qa', 'Linh', 'engineering', [5, 0, 7], [5, 0, 7.9], [4.3, 0, -3.2]],
  ['geometry_bim', 'Minh', 'engineering', [7, 0, 5], [7, 0, 5.9], [6.6, 0, -5]],
  ['cost_bom', 'Chi', 'engineering', [5, 0, 6], [5, 0, 6.9], [3.4, 0, -5]],
  ['inventory', 'Quan', 'engineering', [7, 0, 7], [7, 0, 7.9], [6.6, 0, -3.8]],
];

export const agentConfigs: AgentConfig[] = definitions.map(([role, name, zone, deskPos, homePos, meetingPos], index) => ({
  id: `agent-${String(index + 1).padStart(2, '0')}`,
  name,
  role,
  roleLabel: roleLabels[role],
  color: ROLE_COLORS[role],
  zone,
  deskPos,
  homePos,
  meetingPos,
}));

export const agentConfigById = Object.fromEntries(agentConfigs.map((agent) => [agent.id, agent])) as Record<string, AgentConfig>;

export function getAgentPosition(agentId: string): Vector3 {
  const position = agentConfigById[agentId]?.deskPos ?? [0, 0, 0];
  return new Vector3(position[0], position[1], position[2]);
}

export function getAgentAnchor(agentId: string): Vector3 {
  const position = agentConfigById[agentId]?.homePos ?? [0, 0, 0];
  return new Vector3(position[0], position[1], position[2]);
}

export function getMeetingPosition(agentId: string): Vector3 {
  const position = agentConfigById[agentId]?.meetingPos ?? [5, 0, -5];
  return new Vector3(position[0], position[1], position[2]);
}

export const statusLabels: Record<AgentStatus, string> = {
  idle: 'Idle',
  working: 'Working',
  waiting: 'Waiting',
  blocked: 'Blocked',
  done: 'Done',
};
