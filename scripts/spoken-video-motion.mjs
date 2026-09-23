const PHOTO_MOTION = [
  "Deliver a calm, natural talking-head presentation. Preserve the source person's facial proportions and appearance.",
  "Use restrained facial expressions, natural blinking and small occasional head movements. Keep the head and torso settled between phrases; avoid continuous swaying or repetitive nodding.",
  "If a hand holds an object in the source image, maintain that grip and the object's shape and position relative to the hand. Do not release, swap, raise or put down the object, or use the occupied hand to gesture.",
  "Only an empty hand already visible in the source may make an occasional clear, modest emphasis gesture. Let each gesture finish, return to a relaxed resting pose, and pause before the next. Do not gesture continuously.",
  "If both hands are occupied, resting together, hidden or outside the frame, preserve that arrangement rather than inventing hand movements. Keep movements within the original framing.",
].join(" ");

export function buildSpokenPresenterRequest(payload, person, imageAssetId) {
  const request = {
    type: person.type,
    title: typeof payload.title === "string" ? payload.title.trim() : "",
    aspect_ratio: payload.aspectRatio === "16:9" ? "16:9" : "9:16",
    caption: { file_format: "srt" },
    script: typeof payload.script === "string" ? payload.script.trim() : "",
    voice_id: typeof payload.voiceId === "string" ? payload.voiceId.trim() : "",
  };
  if (person.type === "avatar") {
    request.avatar_id = person.avatarId;
  } else if (person.type === "image" && imageAssetId) {
    request.image = { type: "asset_id", asset_id: imageAssetId };
    request.expressiveness = "low";
    request.motion_prompt = PHOTO_MOTION;
  } else {
    throw new Error("Invalid spoken presenter input");
  }
  return request;
}
