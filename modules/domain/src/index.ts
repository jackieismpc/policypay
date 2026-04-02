import fs from "node:fs";
import path from "node:path";

export type DraftSource = "csv" | "natural-language";

export type DraftIntent = {
  source: DraftSource;
  recipient: string;
  amount: number;
  memo: string;
  reference: string;
  requiresHumanApproval: true;
  warnings: string[];
};

export type DraftBatchIntent = {
  source: DraftSource;
  items: DraftIntent[];
  requiresHumanApproval: true;
  warnings: string[];
};

export type DomainErrorCode = {
  code: string;
  description: string;
};

export type DomainContract = {
  version: string;
  intentStatuses: string[];
  batchStatuses: string[];
  executionStatuses: string[];
  timelineSources: string[];
  batchModes: string[];
  events: string[];
  errorCodes: DomainErrorCode[];
};

let cachedContract: DomainContract | undefined;

const contractFilePath = path.resolve(__dirname, "../contract.json");

export const loadDomainContract = (): DomainContract => {
  if (cachedContract) {
    return cachedContract;
  }

  const raw = fs.readFileSync(contractFilePath, "utf8");
  const parsed = JSON.parse(raw) as DomainContract;
  cachedContract = parsed;
  return parsed;
};

export const DOMAIN_CONTRACT = loadDomainContract();

export const EXECUTION_STATUSES = new Set(DOMAIN_CONTRACT.executionStatuses);
export const TIMELINE_SOURCES = new Set(DOMAIN_CONTRACT.timelineSources);
export const BATCH_MODES = new Set(DOMAIN_CONTRACT.batchModes);
