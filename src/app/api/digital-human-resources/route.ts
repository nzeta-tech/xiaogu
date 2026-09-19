import { retiredChanjingResponse } from "@/lib/digital-human/retirement";
import { requireSessionUser } from "@/lib/auth/session";
import { listCreatorVoices } from "@/lib/digital-human/store";

export async function GET() {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  const voices = await listCreatorVoices(user.id);
  return Response.json({ templates: [], voices: voices.filter(voice => voice.provider === "heygen").map(voice => ({ ...voice, source: "creator" })) });
}
async function retired() {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  return retiredChanjingResponse();
}
export const POST = retired;
export const PATCH = retired;
export const PUT = retired;
export const DELETE = retired;
