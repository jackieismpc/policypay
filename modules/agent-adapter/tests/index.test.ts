import assert from "node:assert/strict";
import test from "node:test";

import {
  assertHumanApprovalRequired,
  parseCsvBatchDraft,
  parseCsvDraft,
  parseNaturalLanguageBatchDraft,
  parseNaturalLanguageDraft,
} from "../src/index";

test("csv draft parsing requires all fields and enforces human approval", () => {
  const draft = parseCsvDraft("recipient-1,100,invoice-1,ref-1");

  assert.equal(draft.source, "csv");
  assert.equal(draft.amount, 100);
  assert.equal(draft.requiresHumanApproval, true);
  assert.equal(assertHumanApprovalRequired(draft), true);
});

test("natural language draft parsing returns warnings", () => {
  const draft = parseNaturalLanguageDraft(
    "recipient-2 250 invoice-2 ref-2 demo"
  );

  assert.equal(draft.source, "natural-language");
  assert.equal(draft.memo, "invoice-2");
  assert.equal(draft.reference, "ref-2 demo");
  assert.equal(draft.warnings.length > 0, true);
});

test("csv batch draft parsing returns intent list", () => {
  const batch = parseCsvBatchDraft(
    ["recipient-1,100,invoice-1,ref-1", "recipient-2,200,invoice-2,ref-2"].join(
      "\n"
    )
  );

  assert.equal(batch.source, "csv");
  assert.equal(batch.items.length, 2);
  assert.equal(batch.items[0].recipient, "recipient-1");
  assert.equal(batch.items[1].amount, 200);
  assert.equal(assertHumanApprovalRequired(batch), true);
});

test("natural language batch draft parsing supports semicolon segments", () => {
  const batch = parseNaturalLanguageBatchDraft(
    "recipient-3 300 invoice-3 ref-3; recipient-4 400 invoice-4 ref-4 extra"
  );

  assert.equal(batch.source, "natural-language");
  assert.equal(batch.items.length, 2);
  assert.equal(batch.items[0].memo, "invoice-3");
  assert.equal(batch.items[1].reference, "ref-4 extra");
  assert.equal(batch.warnings.length > 0, true);
});
