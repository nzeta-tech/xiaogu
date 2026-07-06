import { tryListPublishedAnnouncements } from "@/lib/db/repositories";

export async function GET() {
  const announcements = await tryListPublishedAnnouncements(8);
  return Response.json({ announcements, mode: "server" });
}
