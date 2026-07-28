import { z } from "zod";
import { requireLocalAgent } from "@/lib/local-agent/auth";
import { storeViralCover } from "@/lib/viral-cover-assets";

const inputSchema = z.object({ contentId: z.string().uuid(), thumbnailUrl: z.string().url() });

export async function POST(request: Request) {
  const agent = requireLocalAgent(request);
  if (agent instanceof Response) return agent;
  const input = inputSchema.safeParse(await request.json().catch(() => ({})));
  if (!input.success) return Response.json({ error: "invalid_cover_input" }, { status: 400 });
  try {
    return Response.json(await storeViralCover({ contentId: input.data.contentId, sourceUrl: input.data.thumbnailUrl }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "封面下载失败" }, { status: 422 });
  }
}
