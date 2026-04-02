import assert from "node:assert/strict";
import test from "node:test";

import {
  assertHumanApprovalRequired,
  parseCsvDraft,
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
