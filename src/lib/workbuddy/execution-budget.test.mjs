import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_EXECUTION_BUDGET, availableToolTimeMs, initialBudgetState, inspectExecutionBudget, recordBudgetProgress, toolTimeoutForCapability } from "./execution-budget.ts";

test("semantic budget stops repeated no-progress observations", () => {
  let state = initialBudgetState(0);
  state = recordBudgetProgress(state, { status: "error", summary: "same" });
  state = recordBudgetProgress(state, { status: "error", summary: "same" });
  state = recordBudgetProgress(state, { status: "error", summary: "same" });
  assert.deepEqual(inspectExecutionBudget(DEFAULT_EXECUTION_BUDGET, state, 4, 100), { canContinue: false, reason: "diminishing_returns" });
});

test("semantic budget records novel successful progress", () => {
  let state = initialBudgetState(0);
  state = recordBudgetProgress(state, { status: "success", summary: "first artifact" });
  state = recordBudgetProgress(state, { status: "success", summary: "second artifact" });
  assert.equal(inspectExecutionBudget(DEFAULT_EXECUTION_BUDGET, state, 3, 100).canContinue, true);
});

test("tool budgets are generous but retain finalization time", () => {
  assert.equal(toolTimeoutForCapability("agent.deep-research"), 240_000);
  assert.equal(toolTimeoutForCapability("app.image-card"), 300_000);
  const state = initialBudgetState(0);
  assert.equal(availableToolTimeMs(DEFAULT_EXECUTION_BUDGET, state, 500_000, 0), 390_000);
  assert.equal(availableToolTimeMs(DEFAULT_EXECUTION_BUDGET, state, 90_000, 380_000), 10_000);
});
