import ELK from "elkjs/lib/elk.bundled.js";
import type { WorkflowEdge, WorkflowNode, RoutedPoint } from "./types";

const elk = new ELK();
export const WORKFLOW_NODE_WIDTH = 270;
export const WORKFLOW_NODE_HEIGHT = 132;

export type LayoutDirection = "RIGHT" | "DOWN";

export type LayoutResult = {
  nodes: WorkflowNode[];
  routes: Record<string, RoutedPoint[]>;
};

export async function layoutWorkflowGraph(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  direction: LayoutDirection = "RIGHT",
): Promise<LayoutResult> {
  const isHorizontal = direction === "RIGHT";
  const inSide = isHorizontal ? "WEST" : "NORTH";
  const outSide = isHorizontal ? "EAST" : "SOUTH";

  const graph = await elk.layout({
    id: "atelier-workflow-studio",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": isHorizontal ? "72" : "80",
      "elk.layered.spacing.nodeNodeBetweenLayers": isHorizontal ? "128" : "96",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.mergeEdges": "false",
      "elk.padding": "[top=64,left=64,bottom=64,right=64]",
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: WORKFLOW_NODE_WIDTH,
      height: WORKFLOW_NODE_HEIGHT,
      layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
      ports: [
        { id: `${node.id}:in`, width: 1, height: 1, layoutOptions: { "elk.port.side": inSide } },
        { id: `${node.id}:out`, width: 1, height: 1, layoutOptions: { "elk.port.side": outSide } },
      ],
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [`${edge.source}:out`],
      targets: [`${edge.target}:in`],
    })),
  });

  const positioned = new Map(
    (graph.children ?? []).map((child) => [child.id, { x: child.x ?? 0, y: child.y ?? 0 }]),
  );

  const routes: Record<string, RoutedPoint[]> = {};
  for (const edge of graph.edges ?? []) {
    const section = edge.sections?.[0];
    if (section) {
      routes[edge.id] = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
    }
  }

  return {
    nodes: nodes.map((node) => ({
      ...node,
      position: positioned.get(node.id) ?? node.position ?? { x: 0, y: 0 },
    })),
    routes,
  };
}

export function graphTopologySignature(edges: WorkflowEdge[]) {
  return edges.map(({ source, target, outcome }) => `${source}>${target}:${outcome ?? ""}`).sort();
}

export function hasNodeOverlap(nodes: WorkflowNode[], gap = 8) {
  return nodes.some((node, index) =>
    nodes.slice(index + 1).some((other) => {
      const a = node.position ?? { x: 0, y: 0 };
      const b = other.position ?? { x: 0, y: 0 };
      return (
        a.x < b.x + WORKFLOW_NODE_WIDTH + gap &&
        a.x + WORKFLOW_NODE_WIDTH + gap > b.x &&
        a.y < b.y + WORKFLOW_NODE_HEIGHT + gap &&
        a.y + WORKFLOW_NODE_HEIGHT + gap > b.y
      );
    }),
  );
}
