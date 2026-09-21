const PHOTO_MOTION = "Speak calmly with restrained facial expressions; keep your hands in their original resting position.";

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
