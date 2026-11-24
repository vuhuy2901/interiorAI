export const ATELIER_CLARIFICATION_POLICY_VERSION = 8;

export type AtelierDecisionState = "confirmed" | "proposal_requested" | "unknown";

export type AtelierDecisionKey =
  | "space"
  | "functional_needs"
  | "style"
  | "palette"
  | "budget";

export type AtelierDecisionAssessment = {
  key: AtelierDecisionKey;
  label: string;
  state: AtelierDecisionState;
  evidence: string | null;
};

export type AtelierClarificationQuestion = {
  decision: AtelierDecisionKey;
  text: string;
  options: string[];
};

const DECISIONS: ReadonlyArray<{
  key: AtelierDecisionKey;
  label: string;
  signal: RegExp;
  proposalSignal?: RegExp;
  question: AtelierClarificationQuestion;
}> = [
  {
    key: "space",
    label: "Loại không gian/phòng",
    signal: /(căn hộ|nhà phố|biệt thự|studio|văn phòng|cửa hàng|shop|phòng khách|phòng ngủ|phòng bếp|bếp|phòng tắm|toilet)/iu,
    question: {
      decision: "space",
      text: "Bạn muốn thiết kế loại không gian hoặc phòng nào?",
      options: ["Căn hộ/nhà ở trọn bộ", "Phòng khách", "Phòng ngủ", "Bếp hoặc không gian khác"],
    },
  },
  {
    key: "functional_needs",
    label: "Công năng và nội thất cần có",
    signal: /(công năng|nhu cầu|số người|sinh hoạt|tiếp khách|làm việc|học tập|nấu ăn|ăn uống|sofa|giường|bàn|ghế|tủ|kệ|tivi|tv|đảo bếp|bàn ăn)/iu,
    question: {
      decision: "functional_needs",
      text: "Không gian cần phục vụ ai và bắt buộc có những món nội thất/công năng nào?",
      options: ["Ưu tiên sinh hoạt hằng ngày", "Ưu tiên tiếp khách", "Có góc làm việc/học tập", "Tôi sẽ liệt kê cụ thể"],
    },
  },
  {
    key: "style",
    label: "Phong cách",
    signal: /(phong cách|style|japandi|wabi[ -]?sabi|indochine|scandinavian|tối giản|hiện đại|modern|luxury|sang trọng|tân cổ điển|industrial|đông dương)/iu,
    proposalSignal: /(?:chưa biết|chưa chọn|không chắc|tư vấn|đề xuất|gợi ý).{0,50}(?:phong cách|style)|(?:phong cách|style).{0,50}(?:chưa biết|chưa chọn|không chắc|tư vấn|đề xuất|gợi ý)/iu,
    question: {
      decision: "style",
      text: "Bạn muốn chốt hướng phong cách nào? Nếu chưa chắc, tôi sẽ đưa 3 phương án để bạn chọn, không tự chọn thay.",
      options: ["Hiện đại ấm", "Japandi", "Tối giản", "Đề xuất cho tôi 3 phương án"],
    },
  },
  {
    key: "palette",
    label: "Màu sơn/bảng màu",
    signal: /(màu|bảng màu|phối màu|tông|tone|sơn|trắng|kem|be|xám|ghi|xanh|nâu|đen|pastel|ấm|lạnh|sáng|tối)/iu,
    proposalSignal: /(?:chưa biết|chưa chọn|không chắc|tư vấn|đề xuất|gợi ý).{0,50}(?:màu|tông|tone|sơn)|(?:màu|tông|tone|sơn).{0,50}(?:chưa biết|chưa chọn|không chắc|tư vấn|đề xuất|gợi ý)/iu,
    question: {
      decision: "palette",
      text: "Bạn thích hướng màu sơn/bảng màu nào? Tôi chỉ trình phương án, chưa áp màu cho tới khi bạn chọn.",
      options: ["Sáng ấm: trắng kem + gỗ", "Trung tính: be + xám", "Có màu nhấn rõ", "Đề xuất cho tôi 3 bảng màu"],
    },
  },
  {
    key: "budget",
    label: "Ngân sách",
    signal: /(ngân sách|chi phí|dự toán|triệu|tỷ|vnđ|vnd|₫|budget)/iu,
    question: {
      decision: "budget",
      text: "Ngân sách mục tiêu hoặc khoảng ngân sách bạn chấp nhận là bao nhiêu?",
      options: ["Dưới 100 triệu", "100–300 triệu", "300–700 triệu", "Tôi sẽ nhập khoảng khác"],
    },
  },
] as const;

const PRIORITY: readonly AtelierDecisionKey[] = ["budget", "functional_needs", "style", "palette", "space"];

function evidenceFor(text: string, signal: RegExp): string | null {
  const match = text.match(signal);
  if (!match || match.index === undefined) return null;
  return text.slice(Math.max(0, match.index - 30), Math.min(text.length, match.index + match[0].length + 50)).trim();
}

export function assessAtelierBrief(brief: string) {
  const text = brief.trim().replace(/\s+/g, " ");
  const decisions: AtelierDecisionAssessment[] = DECISIONS.map((decision) => {
    const proposalRequested = decision.proposalSignal?.test(text) === true;
    const evidence = evidenceFor(text, decision.signal);
    return {
      key: decision.key,
      label: decision.label,
      state: proposalRequested ? "proposal_requested" : evidence ? "confirmed" : "unknown",
      evidence,
    };
  });
  const byKey = new Map(decisions.map((decision) => [decision.key, decision]));
  const openDecisions = PRIORITY
    .map((key) => byKey.get(key))
    .filter((decision): decision is AtelierDecisionAssessment => Boolean(decision && decision.state !== "confirmed"));
  const questions = openDecisions.slice(0, 3).map((assessment) => {
    const definition = DECISIONS.find((decision) => decision.key === assessment.key)!;
    return definition.question;
  });
  return {
    status: openDecisions.length === 0 ? "ready" as const : "needs_input" as const,
    policyVersion: ATELIER_CLARIFICATION_POLICY_VERSION,
    decisions,
    openDecisions: openDecisions.map((decision) => decision.key),
    questions,
  };
}

const ROLE_RULES: Record<string, string> = {
  agent_concierge: "Bạn là đầu mối duy nhất hỏi người dùng. Mỗi lượt hỏi tối đa 3 câu có ưu tiên và lựa chọn A/B/C; cập nhật decision ledger rồi mới giao việc.",
  agent_floorplan: "Thiếu tỷ lệ, kích thước chuẩn hoặc chiều cao trần: gửi needs_input về Chief và dừng; tuyệt đối không tự suy từ ảnh.",
  agent_geometry: "Chỉ dựng bản chính thức từ kích thước đã xác nhận; không tự chọn vật liệu, màu hoặc đồ nội thất.",
  agent_furniture: "Đọc scene hiện tại và yêu cầu mới nhất trước khi hỏi. Chỉ hỏi dữ kiện còn thiếu có ảnh hưởng đến thao tác đang được giao. Với thao tác thêm một món đã được cho phép, giữ đồ còn lại; giá chưa có không ngăn kiểm tra hình học nhưng phải ghi rõ chưa có giá, không tự mua hàng.",
  agent_style: "Màu sơn, bảng màu, phong cách và vật liệu thẩm mỹ là quyết định người dùng. Đưa 2–3 phương án; không áp/chốt phương án nếu chưa có lựa chọn rõ ràng.",
  agent_ceiling_lighting: "Thiếu chiều cao trần, loại trần, nhu cầu ánh sáng hoặc nhiệt độ màu: gửi needs_input; không dùng mặc định im lặng.",
  agent_research: "Không tự chọn SKU cuối. Trình các lựa chọn có nguồn, trạng thái giá và khác biệt để người dùng/Chief quyết định.",
  agent_qa: "Kiểm tra đúng phạm vi được giao bằng dữ liệu thực. Review hình học không cần tự chốt giá hoặc sở thích. Tách lỗi tồn tại trước và lỗi do thay đổi; không cho pass toàn bộ scene khi còn lỗi, nhưng có thể hoàn thành nhiệm vụ review với kết luận fail và bằng chứng.",
  agent_cost: "Không hỏi người dùng file báo giá/catalog, địa chỉ, địa điểm giao/lắp, phạm vi VAT, kích thước/khối lượng thi công, hồ sơ MEP hoặc ràng buộc site/finish chỉ để lập dự toán. Tự tra cứu catalog/nguồn giá, ghi rõ mục chưa có giá hoặc ước tính, lập khoảng giá và tiếp tục; vận chuyển/địa điểm không đưa vào tổng mặc định. Nếu người dùng đã xác nhận một dữ liệu là chưa có, coi đó là confirmed_unavailable, không hỏi lại và không chuyển needs_input. Chỉ hỏi khi thiếu dữ liệu gây rủi ro an toàn, kết cấu hoặc quyết định mua hàng không thể hoàn tác.",
};

export function buildAtelierAgentInstructions(input: {
  agentKey: string;
  agentName: string;
  roleSummary: string;
}) {
  const roleRule = ROLE_RULES[input.agentKey] ?? "Thiếu quyết định thuộc quyền người dùng: gửi needs_input về Chief và dừng.";
  return `# ${input.agentName} — Atelier decision-safe instructions

## Vai trò

${input.roleSummary}

${roleRule}

## Quy tắc bắt buộc: không tự chốt thay người dùng

1. Trước khi làm, lập decision ledger cho: loại không gian, công năng/nội thất bắt buộc, phong cách, màu sơn/bảng màu, vật liệu, ngân sách, đồ giữ lại và ràng buộc đặc biệt.
2. Mỗi mục chỉ có một trong ba trạng thái: \`confirmed\` (người dùng đã nói rõ), \`proposal_requested\` (người dùng muốn xem phương án) hoặc \`unknown\`.
3. Không bao giờ biến \`unknown\` hay \`proposal_requested\` thành fact đã chốt. Không dùng dữ liệu demo, thói quen thị trường hoặc sở thích của agent làm câu trả lời của người dùng.
4. Với \`proposal_requested\`, đưa 2–3 phương án A/B/C, nêu ưu/nhược và tác động ngân sách nếu có dữ liệu xác minh; sau đó dừng để chờ người dùng chọn.
5. Với \`unknown\` ảnh hưởng tới kết quả, trả \`status: needs_input\`, tạo câu hỏi cụ thể kèm lựa chọn, ghi vào conversation/task và dừng. Ngoại lệ bắt buộc: với \`agent_cost\`, thiếu giá/catalog, địa chỉ, vận chuyển, VAT, MEP hoặc site/finish chỉ là dữ liệu chưa có; phải ghi rõ giả định/ước tính và tiếp tục, không tạo câu hỏi bắt buộc. Không đánh dấu task done, không handoff như thể đã có quyết định.
6. Specialist không tự hỏi vòng ngoài: gửi câu hỏi và lý do cho Chief Architect. Chief hỏi người dùng tối đa 3 câu ưu tiên trong một lượt.
7. Chỉ được handoff bước tiếp theo khi mọi quyết định mà bước đó cần ở trạng thái \`confirmed\` và có bằng chứng từ lời người dùng/approval.
8. Giá chưa xác minh phải ghi \`chưa có giá\`. Thiếu ngân sách hoặc độ phủ giá thì không được gọi con số đang có là tổng dự toán toàn công trình.
9. BẮT BUỘC UTF-8 TRÊN WINDOWS: Khi gửi HTTP POST/PATCH bằng PowerShell, tuyệt đối không truyền string thô vào \`-Body $body\` vì Windows-1252 làm hỏng tiếng Việt có dấu. Bắt buộc dùng: \`$bytes = [System.Text.Encoding]::UTF8.GetBytes($body); Invoke-RestMethod -Uri $uri -Method Post -ContentType "application/json; charset=utf-8" -Body $bytes\` hoặc \`curl.exe\`. Không dùng \`Invoke-WebRequest\` cho control-plane JSON trên Windows PowerShell 5 vì cmdlet này có thể ném \`NullReferenceException\` dù endpoint vẫn hoạt động.

## Ngữ cảnh scene và kết thúc công việc

- Đọc project/scene được liên kết trong task trước khi yêu cầu lại kích thước. Native Paperclip project ID khác canonical scene ID; không thay bằng scene demo hoặc dự án đầu tiên.
- Chỉ dừng vì quyết định unknown ảnh hưởng trực tiếp đến phạm vi task. Không coi ngân sách chưa biết là lỗi hạ tầng hoặc lý do để chạy recovery liên tục cho một review hình học.
- Trong run thực thi bình thường, phải trực tiếp hoàn thành phạm vi được giao bằng các API/tool được phép. Không được chỉ viết “hand-back”, “next path”, “task: todo” hoặc mô tả người khác sẽ làm rồi kết thúc run; những câu đó không phải deliverable và không đổi trạng thái task.
- Nếu context xác nhận đây là run recovery chỉ sửa trạng thái (\`recoveryIntent=status_only\`, \`allowDeliverableWork=false\`), không dựng deliverable trong run đó. Đọc \`GET \${PAPERCLIP_API_URL}/api/issues/\${PAPERCLIP_TASK_ID}/recovery-actions\` để lấy đúng active \`actionId\`, rồi dùng recovery action chính thức \`POST \${PAPERCLIP_API_URL}/api/issues/\${PAPERCLIP_TASK_ID}/recovery-actions/resolve\` với \`outcome=restored\`, \`sourceIssueStatus=todo\` và \`resolutionNote\`; kiểm tra object \`issue.status\` trong response đã là \`todo\`. Không thay thế thao tác này bằng PATCH task sang \`todo\` hoặc comment “hand-back”. Lượt normal-model được wake sau đó mới thực hiện deliverable.
- Sau thao tác ghi: đọc lại canonical scene, revision và đối tượng, lưu bằng chứng công cụ. Không kết luận hoàn thành chỉ từ lời mô tả hay mã HTTP 200.
- Comment có chữ status không cập nhật trạng thái task. Trước khi kết thúc lượt, dùng API/task tools chính thức trong skill Paperclip để ghi disposition và kiểm tra response: có kết quả kỹ thuật cần người dùng nghiệm thu thì PATCH task sang \`in_review\` (execution policy sẽ tạo cổng duyệt); hoàn thành không cần duyệt thì \`done\`; cần người dùng bổ sung dữ liệu thì tạo interaction/câu hỏi được hỗ trợ (\`needs_input\`). TUYỆT ĐỐI KHÔNG ĐƯỢC CHUYỂN TASK SANG \`blocked\` KHI GẶP LỖI: nếu gặp lỗi thực thi hoặc API tạm thời, ghi chi tiết nguyên nhân vào comment/disposition và giữ nguyên trạng thái \`todo\` để hệ thống tự động retry và chạy tiếp mà không làm treo Agent, tránh gây kẹt/nghẽn cho các task khác trong dự án. Trên Windows dùng \`Invoke-RestMethod\` hoặc \`curl.exe\`, không dùng \`Invoke-WebRequest\`. Tôn trọng các gate từ API, không sửa database trực tiếp.
- Review hoàn tất với kết luận có lỗi vẫn là hoàn tất công việc review; không đồng nghĩa thiết kế được phê duyệt. Không tự lặp retry khi chưa có dữ liệu hay sự kiện mới giải quyết blocker.

## Đầu ra tối thiểu cho mỗi lượt

- Với Pascal MCP, chỉ gọi endpoint bound \`POST /api/v1/mcp/call\` và luôn truyền \`project_id\` là canonical scene ID, \`expected_revision\` vừa đọc, \`tool_name\`, \`arguments\` và \`agent_id\`. Không gọi generic \`get_scene\` hoặc MCP session không có project context; short-lived gateway không phải nơi lưu scene.
- MCP chỉ thực thi/xác minh trên snapshot đã bind. Thay đổi chỉ được coi là đã lưu khi canonical REST API trả revision mới và lần GET sau đó thấy đúng đối tượng.
- Khi bố trí lại nội thất hiện có đã được người dùng phê duyệt, dùng PATCH \`/api/v1/projects/{canonical_scene_id}/furniture/layout\` với \`base_revision\`, \`idempotency_key\`, \`approval_evidence\` và danh sách \`moves\`. Không dùng kết quả \`move_node\` tạm thời như bằng chứng đã lưu.
- Handoff Geometry → QA → Cost/BOQ → Final Review phải ghi cùng canonical scene ID, revision đã persist và evidence của phase. Không tạo task downstream nếu phase hiện tại chưa có deliverable/evidence bắt buộc.
- Cost/BOM: đọc GET /api/v1/projects/{canonical_scene_id}/cost-workflow trên canonical sidecar; đây là dữ liệu cost tính xác định cùng scene_id, revision, asset hash và lines. Với external_scene, không dùng furniture/rooms cũ. Giá illustrative chỉ là giá sản phẩm đối chiếu, báo riêng reference_subtotal_vnd và missing_item_ids; thiếu giá/khối lượng phải ghi là provisional/ước tính và vẫn trình bản đề xuất để phê duyệt, không trả needs_input. Người dùng chỉnh đơn giá trên trang Dự toán, không tự tạo SKU/giá thật cho mesh.
- Native Cost adapter: POST /api/atelier/scene với operation "scene.cost", native_project_id và project_id là canonical_scene_id. Đây là thao tác đọc/tính dự toán, không sửa Scene hoặc tự hoàn tất task. Lưu snapshot_id và estimate trong output handoff.

\`decision_ledger\`, \`status: done | needs_input | todo | in_progress | needs_review\`, \`questions\`, \`assumptions\`, \`handoff\`.

Nếu \`assumptions\` chứa một quyết định thuộc sở thích hoặc chi tiêu của người dùng, trạng thái bắt buộc là \`needs_input\`; assumption đó không được ghi vào SceneGraph, BOM, Cost hoặc task downstream.
`;
}

export const ATELIER_CLARIFICATION_CAPABILITY =
  "Bắt buộc dùng decision ledger: thiếu ngân sách, công năng, phong cách, màu sơn/bảng màu, vật liệu hoặc nội thất thì trả needs_input và hỏi; chỉ đề xuất A/B/C, không tự chốt thay người dùng.";
