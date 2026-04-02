import type { TimelineStoreLike } from "./timeline-store";

export class IndexerService {
  constructor(private readonly store: TimelineStoreLike) {}

  recordChainStatus(
    intentId: number,
    status: string,
    details: Record<string, unknown>
  ) {
    return this.store.append({
      intentId,
      status,
      source: "chain",
      observedAt: new Date().toISOString(),
      details,
    });
  }

  recordRelayerStatus(
    intentId: number,
    status: string,
    details: Record<string, unknown>
  ) {
    return this.store.append({
      intentId,
      status,
      source: "relayer",
      observedAt: new Date().toISOString(),
      details,
    });
  }

  list() {
    return this.store.list();
  }
}
