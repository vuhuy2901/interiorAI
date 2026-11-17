import { ISSUE_STATUSES, type IssueStatus } from "@paperclipai/shared";
import type { RoutedPoint, WorkflowEdge, WorkflowNode } from "./types";

const labels: Record<IssueStatus, string> = {
  backlog: "Backlog", todo: "To do", in_progress: "In progress", in_review: "In review",
  blocked: "Blocked", done: "Done", cancelled: "Cancelled",
};

export const TASK_LIFECYCLE_STATES: Array<{ key: IssueStatus; name: IssueStatus; description: string }> = [
  { key: "backlog", name: "backlog", description: "Công việc mới được ghi nhận, chưa ưu tiên xử lý." },
  { key: "todo", name: "todo", description: "Đã sẵn sàng để giao cho agent hoặc bắt đầu thực hiện." },
  { key: "in_progress", name: "in_progress", description: "Agent đang thực hiện công việc." },
  { key: "in_review", name: "in_review", description: "Kết quả đã gửi để kiểm tra hoặc chờ người duyệt." },
  { key: "blocked", name: "blocked", description: "Đang bị chặn bởi dữ liệu, quyền hoặc điều kiện đầu vào." },
  { key: "done", name: "done", description: "Đã hoàn thành và nghiệm thu." },
  { key: "cancelled", name: "cancelled", description: "Công việc đã bị hủy." },
];

// Paperclip validates the target against ISSUE_STATUSES but does not constrain
// from/to pairs. This is a truthful presentation map of common core movements,
// not a separate execution state machine.
export function taskLifecycleGraph(): { nodes: WorkflowNode[]; edges: WorkflowEdge[]; routes: Record<string, RoutedPoint[]> } {
  const positions: Record<IssueStatus, { x: number; y: number }> = {
    backlog: { x: 40, y: 180 }, todo: { x: 340, y: 180 }, in_progress: { x: 640, y: 180 },
    in_review: { x: 940, y: 180 }, done: { x: 1240, y: 180 },
    blocked: { x: 640, y: 400 }, cancelled: { x: 340, y: 400 },
  };
  const nodes: WorkflowNode[] = ISSUE_STATUSES.map((status) => ({
    id: `task_${status}`,
    type: status === "done" || status === "cancelled" ? "END" : status === "blocked" ? "RETRY_RECOVERY" : status === "in_review" ? "APPROVAL_GATE" : status === "backlog" ? "START" : "AGENT_TASK",
    name: labels[status],
    description: `Paperclip issue status: ${status}`,
    taskType: "ISSUE_STATUS",
    requiredRole: "task_owner",
    position: positions[status],
  }));
  const edges: WorkflowEdge[] = [
    { id: "lc_backlog_todo", source: "task_backlog", target: "task_todo", outcome: "Prioritize" },
    { id: "lc_todo_progress", source: "task_todo", target: "task_in_progress", outcome: "Start work" },
    { id: "lc_progress_review", source: "task_in_progress", target: "task_in_review", outcome: "Submit for review" },
    { id: "lc_review_done", source: "task_in_review", target: "task_done", outcome: "Complete" },
    { id: "lc_progress_blocked", source: "task_in_progress", target: "task_blocked", outcome: "Block" },
    { id: "lc_blocked_todo", source: "task_blocked", target: "task_todo", outcome: "Resume" },
    { id: "lc_done_todo", source: "task_done", target: "task_todo", outcome: "Reopen" },
    { id: "lc_todo_cancelled", source: "task_todo", target: "task_cancelled", outcome: "Cancel" },
  ];
  const routes: Record<string, RoutedPoint[]> = {
    lc_backlog_todo: [{ x: 284, y: 232 }, { x: 340, y: 232 }],
    lc_todo_progress: [{ x: 584, y: 232 }, { x: 640, y: 232 }],
    lc_progress_review: [{ x: 884, y: 232 }, { x: 940, y: 232 }],
    lc_review_done: [{ x: 1184, y: 232 }, { x: 1240, y: 232 }],
    lc_progress_blocked: [{ x: 884, y: 232 }, { x: 910, y: 232 }, { x: 910, y: 452 }, { x: 640, y: 452 }],
    lc_blocked_todo: [{ x: 884, y: 452 }, { x: 920, y: 452 }, { x: 920, y: 570 }, { x: 300, y: 570 }, { x: 300, y: 232 }, { x: 340, y: 232 }],
    lc_done_todo: [{ x: 1484, y: 232 }, { x: 1520, y: 232 }, { x: 1520, y: 70 }, { x: 300, y: 70 }, { x: 300, y: 232 }, { x: 340, y: 232 }],
    lc_todo_cancelled: [{ x: 584, y: 232 }, { x: 610, y: 232 }, { x: 610, y: 452 }, { x: 340, y: 452 }],
  };
  return { nodes, edges, routes };
}
