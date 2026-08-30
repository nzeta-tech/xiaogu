import assert from "node:assert/strict";
import test from "node:test";
import { getCreationUserError, isRetryableCreationError, shouldRetryCreationError } from "./errors.ts";

test("treats fetch failures as retryable and creator-friendly", () => {
  const error = new TypeError("fetch failed");
  assert.equal(isRetryableCreationError(error), true);
  assert.match(getCreationUserError(error), /连接中断/);
  assert.doesNotMatch(getCreationUserError(error), /fetch failed/i);
});

test("does not retry validation failures", () => {
  assert.equal(isRetryableCreationError(new Error("主题还没有填写。")), false);
});

test("caps transient generation retries at two attempts", () => {
  const error = new Error("生成服务连接中断");
  assert.equal(shouldRetryCreationError(error, 0), true);
  assert.equal(shouldRetryCreationError(error, 1), true);
  assert.equal(shouldRetryCreationError(error, 2), false);
  assert.equal(shouldRetryCreationError(new Error("主题还没有填写。"), 0), false);
});
