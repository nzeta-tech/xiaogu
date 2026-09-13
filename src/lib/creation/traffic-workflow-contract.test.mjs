import assert from "node:assert/strict";
import test from "node:test";
import { buildTrafficGenerationValues, buildTrafficTopicAnalysisValues, readTrafficCoachOverrides, trafficCoachOverrideFieldId } from "./traffic-workflow-contract.ts";

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
