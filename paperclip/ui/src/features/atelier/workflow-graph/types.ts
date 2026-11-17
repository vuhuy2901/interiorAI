export const WORKFLOW_NODE_KINDS = [
  "START", "AGENT_TASK", "TOOL_EXECUTION", "HUMAN_INPUT", "APPROVAL_GATE",
  "CONDITION", "PARALLEL_BRANCH", "JOIN", "RESEARCH", "VALIDATION",
  "RETRY_RECOVERY", "NOTIFICATION", "EXPORT", "END",
] as const;

export type WorkflowNodeKind = (typeof WORKFLOW_NODE_KINDS)[number];

export type WorkflowNode = {
  id: string;
  type: WorkflowNodeKind;
  name: string;
  description?: string;
  prompt?: string;
  position?: { x: number; y: number };
  taskType?: string;
  requiredRole?: string;
  assignedAgentId?: string | null;
  agentSelector?: { strategy: "CAPABILITY_MATCH" | "EXPLICIT"; capability?: string };
  requiredInputs?: string[];
  requiredOutputs?: string[];
  requiredArtifacts?: string[];
  completionCriteria?: string[];
  allowedTools?: string[];
  timeoutSeconds?: number;
  retryPolicy?: { maxAttempts: number; backoffSeconds?: number };
  approval?: { required: boolean; approverRole?: string; approverAgentIds?: string[] };
  conditionOutcomes?: string[];
  lifecycleStateOnly?: boolean;
  includesValidator?: boolean;
  stepNumber?: number;
  totalSteps?: number;
  stepLabel?: string;
  sourceNodes?: string[];
  stepSettings?: StepSettings;
};

export type WorkflowEdge = { id: string; source: string; target: string; outcome?: string };

export type WorkflowDefinition = {
  schemaVersion: 2;
  key: string;
  name: string;
  description?: string;
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  canvas?: Record<string, unknown>;
  gatePolicy?: Record<string, unknown>;
  stateMachine?: string[];
  optionalSteps?: { costBomAfterApproval?: OptionalCostBomStep };
};

export type OptionalCostBomStep = {
  id: string;
  name: string;
  enabled: boolean;
  runsAfterApproval: boolean;
  requiredRole: string;
  taskType: string;
  capability: string;
  description?: string;
};

export type StepSettings = {
  retry?: { maxAttempts: number; backoffSeconds?: number };
  logging?: { enabled?: boolean; level?: "info" | "debug" | "error" };
  notifications?: {
    onStart?: boolean;
    onComplete?: boolean;
    onError?: boolean;
    channel?: string;
  };
};

export type RoutedPoint = { x: number; y: number };
export type RoutedEdgeData = { points?: RoutedPoint[]; outcome?: string; backward?: boolean };
