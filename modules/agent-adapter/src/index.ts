export type DraftIntent = {
  source: "csv" | "natural-language";
  recipient: string;
  amount: number;
  memo: string;
  reference: string;
  requiresHumanApproval: true;
  warnings: string[];
};

export type DraftBatchIntent = {
  source: DraftIntent["source"];
  items: DraftIntent[];
  requiresHumanApproval: true;
  warnings: string[];
};

const toDraftIntent = (
  source: DraftIntent["source"],
  recipient: string,
  amount: number,
  memo: string,
  reference: string,
  warnings: string[]
): DraftIntent => ({
  source,
  recipient,
  amount,
  memo,
  reference,
  requiresHumanApproval: true,
  warnings,
});

export const parseCsvDraft = (input: string): DraftIntent => {
  const [recipient, amount, memo, reference] = input
    .split(",")
    .map((value) => value.trim());

  if (!recipient || !amount || !memo || !reference) {
    throw new Error("csv draft requires recipient,amount,memo,reference");
  }

  return toDraftIntent("csv", recipient, Number(amount), memo, reference, [
    "draft generated from csv input",
    "human approval required before onchain create_intent",
  ]);
};

export const parseNaturalLanguageDraft = (input: string): DraftIntent => {
  const normalized = input.trim();
  const parts = normalized.split(/\s+/);

  if (parts.length < 4) {
    throw new Error(
      "natural language draft requires at least recipient amount memo reference"
    );
  }

  const [recipient, amount, memo, ...referenceParts] = parts;

  return toDraftIntent(
    "natural-language",
    recipient,
    Number(amount),
    memo,
    referenceParts.join(" "),
    [
      "draft generated from natural language input",
      "review recipient, amount, memo, and reference before approval",
      "human approval required before onchain create_intent",
    ]
  );
};

const buildBatchWarnings = (source: DraftIntent["source"], count: number) => [
  `batch draft generated from ${source} input`,
  `batch contains ${count} intents`,
  "human approval required before onchain create_intent",
];

export const parseCsvBatchDraft = (input: string): DraftBatchIntent => {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error("csv batch draft requires at least one non-empty line");
  }

  const items = lines.map((line) => parseCsvDraft(line));

  return {
    source: "csv",
    items,
    requiresHumanApproval: true,
    warnings: buildBatchWarnings("csv", items.length),
  };
};

export const parseNaturalLanguageBatchDraft = (
  input: string
): DraftBatchIntent => {
  const segments = input
    .split(";")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    throw new Error(
      "natural language batch draft requires at least one non-empty segment"
    );
  }

  const items = segments.map((segment) => parseNaturalLanguageDraft(segment));

  return {
    source: "natural-language",
    items,
    requiresHumanApproval: true,
    warnings: buildBatchWarnings("natural-language", items.length),
  };
};

export const assertHumanApprovalRequired = (
  draft: DraftIntent | DraftBatchIntent
) => {
  if (!draft.requiresHumanApproval) {
    throw new Error("draft must require human approval");
  }

  return true;
};
