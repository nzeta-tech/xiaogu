import { requireSessionUser } from "@/lib/auth/session";
import { retiredChanjingResponse } from "@/lib/digital-human/retirement";

export async function POST() {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  return retiredChanjingResponse();
}
