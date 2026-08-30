import test from "node:test";
import assert from "node:assert/strict";
import { isConnectionEstablishmentTimeout } from "./client.ts";

test("retries only the known pre-query connection timeout", () => {
  assert.equal(isConnectionEstablishmentTimeout(new Error("Connection terminated due to connection timeout")), true);
  assert.equal(isConnectionEstablishmentTimeout(new Error("query timeout")), false);
  assert.equal(isConnectionEstablishmentTimeout(new Error("connection reset by peer")), false);
  assert.equal(isConnectionEstablishmentTimeout("Connection terminated due to connection timeout"), false);
});
