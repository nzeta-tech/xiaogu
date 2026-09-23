import assert from "node:assert/strict";
import test from "node:test";
import { buildTrafficGenerationValues, buildTrafficTopicAnalysisValues, readTrafficCoachOverrides, restoreTrafficRegenerationValues, trafficCoachOverrideFieldId } from "./traffic-workflow-contract.ts";

test("topic analysis uses the same coach-independent contract for every entry", () => {
  assert.deepEqual(buildTrafficTopicAnalysisValues({ source: "素材", creative_coach_version_ids: ["legacy"] }, "workbuddy"), {
    source: "素材", creative_coach_version_ids: ["legacy"], traffic_topic_only: "yes", app_entry: "workbuddy",
  });
  assert.equal("traffic_arena_coach_version_ids" in buildTrafficTopicAnalysisValues({ traffic_arena_coach_version_ids: ["legacy"] }, "workbuddy"), false);
});

test("generation resolves selected topics and per-topic coach overrides", () => {
  const topics = [
    { id: "topic-1", title: "一", recommendedCoachId: "coach-a", recommendedCoachLabel: "A" },
    { id: "topic-2", title: "二", assignedCoachId: "default", assignedCoachLabel: "小谷教练" },
  ];
  const values = buildTrafficGenerationValues({ base: { source: "素材" }, topicWorkId: "work-1", topics, selectedTopicIds: ["topic-1", "topic-2"], coachOverrides: { "topic-2": "coach-b" }, coachLabels: { "coach-b": "B" }, appEntry: "workbuddy" });
  assert.deepEqual(values.creative_coach_version_ids, ["coach-a", "coach-b"]);
  assert.equal(JSON.parse(values.traffic_selected_topics[1]).assignedCoachLabel, "B");
  assert.equal(values.app_entry, "workbuddy");
});

test("coach override fields have a stable shared name", () => {
  const id = trafficCoachOverrideFieldId("topic-1");
  assert.deepEqual(readTrafficCoachOverrides({ [id]: "coach-a" }, ["topic-1"]), { "topic-1": "coach-a" });
});

test("multi-topic regeneration preserves selected topics and coaches without reusing a consumed topic work", () => {
  const previous = { source:"原热点素材", traffic_existing_work_id:"old-work", traffic_selected_topic_ids:["topic-1","topic-6"], traffic_selected_topics:[JSON.stringify({id:"topic-1",assignedCoachId:"coach-a"}),JSON.stringify({id:"topic-6",assignedCoachId:"coach-b"})], creative_coach_version_ids:["coach-a","coach-b"], traffic_shared_research:"研究资料", traffic_topic_process:"{}" };
  const restored = restoreTrafficRegenerationValues({ source:"两篇旧稿拼接" }, previous, "两篇分别写长一些");
  assert.equal(restored.traffic_topic_only, "no");
  assert.equal(restored.traffic_selected_topics.length, 2);
  assert.deepEqual(restored.creative_coach_version_ids, ["coach-a","coach-b"]);
  assert.equal(restored.traffic_existing_work_id, undefined);
  assert.equal(restored.traffic_selected_topic_ids, undefined);
  assert.match(restored.source, /原热点素材[\s\S]*两篇分别写长一些/);
});
