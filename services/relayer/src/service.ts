import { RelayerStore } from "./store";

export type ExecutionTask = {
  policy: string;
  intentId: number;
  paymentIntent: string;
  shouldFail?: boolean;
  failureReason?: string;
};

export class RelayerService {
  constructor(private readonly store: RelayerStore) {}

  async process(task: ExecutionTask) {
    const timestamp = new Date().toISOString();

    if (task.shouldFail) {
      return this.store.upsert({
        intentId: task.intentId,
        paymentIntent: task.paymentIntent,
        status: "failed",
        failureReason: task.failureReason ?? "relayer simulated failure",
        updatedAt: timestamp,
      });
    }

    return this.store.upsert({
      intentId: task.intentId,
      paymentIntent: task.paymentIntent,
      status: "submitted",
      signature: `relayer-${task.intentId}-${Date.now()}`,
      updatedAt: timestamp,
    });
  }

  async confirm(intentId: number) {
    const existing = this.store
      .list()
      .find((item) => item.intentId === intentId);

    if (!existing) {
      throw new Error(`intent ${intentId} not found in relayer store`);
    }

    return this.store.upsert({
      ...existing,
      status: "confirmed",
      updatedAt: new Date().toISOString(),
    });
  }

  list() {
    return this.store.list();
  }
}
