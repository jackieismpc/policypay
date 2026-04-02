import { EXECUTION_STATUSES } from "../../../modules/domain/src/index";
import type { RelayerStoreLike } from "./store";

export type ExecutionTask = {
  policy: string;
  intentId: number;
  paymentIntent: string;
  shouldFail?: boolean;
  failureReason?: string;
};

export type BatchExecutionMode = "abort-on-error" | "continue-on-error";

export type BatchExecutionResult = {
  intentId: number;
  status: "succeeded" | "failed";
  record?: Awaited<ReturnType<RelayerService["process"]>>;
  error?: string;
};

const requireExecutionStatus = (
  status: "submitted" | "confirmed" | "failed"
) => {
  if (!EXECUTION_STATUSES.has(status)) {
    throw new Error(`domain contract missing execution status: ${status}`);
  }

  return status;
};

const SUBMITTED_STATUS = requireExecutionStatus("submitted");
const CONFIRMED_STATUS = requireExecutionStatus("confirmed");
const FAILED_STATUS = requireExecutionStatus("failed");

export class RelayerService {
  constructor(private readonly store: RelayerStoreLike) {}

  async process(task: ExecutionTask) {
    const timestamp = new Date().toISOString();

    if (task.shouldFail) {
      return this.store.upsert({
        intentId: task.intentId,
        paymentIntent: task.paymentIntent,
        status: FAILED_STATUS,
        failureReason: task.failureReason ?? "relayer simulated failure",
        updatedAt: timestamp,
      });
    }

    return this.store.upsert({
      intentId: task.intentId,
      paymentIntent: task.paymentIntent,
      status: SUBMITTED_STATUS,
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
      status: CONFIRMED_STATUS,
      updatedAt: new Date().toISOString(),
    });
  }

  list() {
    return this.store.list();
  }

  async processBatch(tasks: ExecutionTask[], mode: BatchExecutionMode) {
    const results: BatchExecutionResult[] = [];

    for (const task of tasks) {
      try {
        const record = await this.process(task);
        const status = record.status === FAILED_STATUS ? "failed" : "succeeded";
        results.push({
          intentId: task.intentId,
          status,
          record,
          error: status === "failed" ? record.failureReason : undefined,
        });

        if (status === "failed" && mode === "abort-on-error") {
          break;
        }
      } catch (error) {
        results.push({
          intentId: task.intentId,
          status: "failed",
          error: String(error),
        });

        if (mode === "abort-on-error") {
          break;
        }
      }
    }

    return {
      mode,
      total: tasks.length,
      processed: results.length,
      succeeded: results.filter((item) => item.status === "succeeded").length,
      failed: results.filter((item) => item.status === "failed").length,
      results,
    };
  }
}
