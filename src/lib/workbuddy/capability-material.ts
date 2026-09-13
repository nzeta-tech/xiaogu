export type CapabilityMaterialInput = {
  objective: string;
  context: string;
  previousArtifact?: string;
  followup?: string;
  sourceMaterial?: string;
};

export function buildCapabilitySourceText(input: CapabilityMaterialInput) {
  if (input.sourceMaterial?.trim()) return input.sourceMaterial.trim();
  const previousArtifact = input.previousArtifact?.trim();
  const hasUsableArtifact = Boolean(previousArtifact && !/^(?:尚无已有交付|无)[。.]?$/.test(previousArtifact));
  if (hasUsableArtifact && input.followup?.trim()) return [
    `【承接素材】\n${previousArtifact}`,
    `【用户本轮要求】\n${input.followup.trim()}`,
  ].join("\n\n");
  return [
    `【用户目标】\n${input.objective}`,
    input.context && `【补充资料】\n${input.context}`,
    hasUsableArtifact && `【已有版本】\n${previousArtifact}`,
    input.followup && `【用户本轮要求】\n${input.followup}`,
  ].filter(Boolean).join("\n\n");
}
