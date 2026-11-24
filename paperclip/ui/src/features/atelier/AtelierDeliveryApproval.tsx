import { useState } from "react";

export function AtelierDeliveryApproval({ runId, output, onAccepted }: {
  runId: string;
  output: Record<string, unknown>;
  onAccepted: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function accept() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/atelier/workflow/runs/${encodeURIComponent(runId)}/stages/delivery/complete`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: `human-accept:${runId}:${output.revision}`, output, approve: true }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? `Không thể nghiệm thu (${response.status})`);
      }
      onAccepted();
    } catch (err) { setError(err instanceof Error ? err.message : "Không thể nghiệm thu"); }
    finally { setSaving(false); }
  }
  const references = Array.isArray(output.references) ? output.references as Array<{ uri: string }> : [];
  return <section className="space-y-3 rounded-lg border border-border bg-card p-4">
    <h2 className="font-semibold text-foreground">Nghiệm thu bàn giao</h2>
    <p className="text-sm text-muted-foreground">{String(output.summary ?? "")}</p>
    {references.map(reference => <a key={reference.uri} className="block text-sm text-primary underline" href={reference.uri} target="_blank" rel="noreferrer">Xem hồ sơ bàn giao</a>)}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <button type="button" disabled={saving} onClick={() => void accept()} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{saving ? "Đang ghi nhận…" : "Chấp nhận bàn giao"}</button>
  </section>;
}
