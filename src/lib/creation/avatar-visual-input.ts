export function creationNeedsAvatarPhoto(input: {
  appSlug: string;
  entry?: string;
  values: Record<string, unknown>;
  isXiaohongshuStudioAssetStep?: boolean;
}) {
  const { appSlug, entry = "", values, isXiaohongshuStudioAssetStep = false } = input;
  if (entry === "personality-card") return true;
  if (appSlug === "image-card") {
    const isLinkedResultEdit = values.creation_mode === "image_remix"
      && typeof values.source_work_id === "string"
      && values.source_work_id.trim().length > 0
      && typeof values.source_image_id === "string"
      && values.source_image_id.trim().length > 0
      && (typeof values.reference_image === "string"
        ? values.reference_image.trim().length > 0
        : Array.isArray(values.reference_image) && values.reference_image.some((value) => typeof value === "string" && value.trim().length > 0));
    // "修改这张" already supplies the selected generated card as the linked
    // visual reference. Requiring the user to upload the same portrait again
    // makes image edits fail whenever the original portrait was not persisted.
    return values.draw_portrait === "yes" && !isLinkedResultEdit;
  }
  if (isXiaohongshuStudioAssetStep && appSlug === "wechat-cover") return values.avatar_visual_mode === "yes";
  return ["wechat-images", "policy-renewal-card", "video-cover"].includes(appSlug)
    && values.avatar_visual_mode === "yes";
}
