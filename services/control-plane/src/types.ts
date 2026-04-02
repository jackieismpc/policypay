export type AuditEntry = {
  id: string;
  action: string;
  status: "requested" | "succeeded" | "failed";
  createdAt: string;
  details: Record<string, unknown>;
};

export const buildAuditEntry = (
  action: string,
  status: AuditEntry["status"],
  details: Record<string, unknown>
): AuditEntry => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  action,
  status,
  createdAt: new Date().toISOString(),
  details,
});
