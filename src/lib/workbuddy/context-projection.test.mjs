import test from "node:test";
import assert from "node:assert/strict";
import { projectConversationContext } from "./context-projection.ts";

test("keeps objectives and deliveries pinned while dropping progress noise", () => {
  const projection = projectConversationContext([
    { role: "user", message_type: "objective", content: "找热点" },
    { role: "system", message_type: "progress", content: "轮询中" },
    { role: "assistant", message_type: "delivery", content: "已确认案例" },
    ...Array.from({ length: 8 }, (_, i) => ({ role: "user", message_type: "followup", content: `追问${i}` })),
  ], { recentLimit: 2, compactLimit: 3 });
  assert.equal(projection.pinned.length, 2);
  assert.deepEqual(projection.recent.map(item => item.content), ["追问6", "追问7"]);
  assert.equal(projection.compacted.length, 3);
  assert.equal(projection.droppedCount, 3);
});
