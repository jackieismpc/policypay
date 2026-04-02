import assert from "node:assert/strict";
import test from "node:test";

import {
  BATCH_MODES,
  DOMAIN_CONTRACT,
  EXECUTION_STATUSES,
  TIMELINE_SOURCES,
  loadDomainContract,
} from "../src/index";

test("domain contract loads with expected version and core enums", () => {
  const contract = loadDomainContract();

  assert.equal(contract.version, "v1");
  assert.equal(contract.intentStatuses.includes("approved"), true);
  assert.equal(contract.batchStatuses.includes("pending_approval"), true);
});

test("domain contract exports status/source/mode sets", () => {
  assert.equal(EXECUTION_STATUSES.has("submitted"), true);
  assert.equal(EXECUTION_STATUSES.has("failed"), true);
  assert.equal(TIMELINE_SOURCES.has("chain"), true);
  assert.equal(BATCH_MODES.has("abort-on-error"), true);
});

test("domain contract includes standardized error codes", () => {
  const codes = DOMAIN_CONTRACT.errorCodes.map((item) => item.code);
  assert.equal(codes.includes("auth.unauthorized"), true);
  assert.equal(codes.includes("resource.not_found"), true);
});
