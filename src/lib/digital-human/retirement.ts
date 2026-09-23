// Historical provider identifiers remain valid for reading saved assets and works.
// New avatar creation and legacy video synthesis use HeyGen only.
export const LEGACY_CHANJING_RETIRED = "禅境服务及模板声音已下线，请使用口播照片与我的录制声音。";
export function retiredChanjingResponse() {
  return Response.json({ code: "CHANJING_RETIRED", error: LEGACY_CHANJING_RETIRED }, { status: 410 });
}
export function assertActiveAvatarProvider(provider: string) {
  if (provider === "chanjing") throw new Error(LEGACY_CHANJING_RETIRED);
}
