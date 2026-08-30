import { z } from "zod";
import { requireLocalAgent } from "@/lib/local-agent/auth";
import { storeUploadedViralCover, storeViralCover } from "@/lib/viral-cover-assets";

const inputSchema = z.object({
  contentId: z.string().uuid(),
  thumbnailUrl: z.string().url().optional(),
  refererUrl: z.string().url().optional(),
  imageBase64: z.string().max(14 * 1024 * 1024).optional(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]).optional(),
  sourceUrl: z.string().url().optional(),
}).refine((value) => Boolean(value.thumbnailUrl || (value.imageBase64 && value.contentType)), "cover payload is required");

export async function POST(request: Request) {
  const agent = requireLocalAgent(request);
  if (agent instanceof Response) return agent;
  const input = inputSchema.safeParse(await request.json().catch(() => ({})));
  if (!input.success) return Response.json({ error: "invalid_cover_input" }, { status: 400 });
  try {
    if (input.data.imageBase64 && input.data.contentType) {
      return Response.json(await storeUploadedViralCover({
        contentId: input.data.contentId,
        contentType: input.data.contentType,
        bytes: Buffer.from(input.data.imageBase64, "base64"),
        sourceUrl: input.data.sourceUrl,
      }));
    }
    return Response.json(await storeViralCover({ contentId: input.data.contentId, sourceUrl: input.data.thumbnailUrl!, refererUrl: input.data.refererUrl }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "封面下载失败" }, { status: 422 });
  }
}
