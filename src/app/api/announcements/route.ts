import { tryListPublishedAnnouncements } from "@/lib/db/repositories";

export async function GET(request: Request) {
  const placementValue = new URL(request.url).searchParams.get("placement");
  const placement = placementValue === "dashboard" || placementValue === "billing" || placementValue === "benefits" ? placementValue : undefined;
  const announcements = await tryListPublishedAnnouncements(8, placement);
  return Response.json({ announcements, mode: "server" });
}
