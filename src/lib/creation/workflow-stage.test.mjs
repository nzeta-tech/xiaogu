import assert from "node:assert/strict";
import test from "node:test";
import { isAwaitingWorkflowSelection } from "./workflow-stage.ts";

test("generic workflow stages identify selection pauses", () => {
  assert.equal(isAwaitingWorkflowSelection({ workflow: "traffic-copy", phase: "awaiting-selection" }), true);
  assert.equal(isAwaitingWorkflowSelection({ workflow: "ppt", phase: "generating" }), false);
  assert.equal(isAwaitingWorkflowSelection(null), false);
});
