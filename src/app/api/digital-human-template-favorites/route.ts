import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { listTemplateFavorites, removeTemplateFavorite, saveTemplateFavorite } from "@/lib/digital-human/store";

const templateSchema = z.object({ id: z.string().min(1).max(100), collection: z.enum(["expressive", "production"]), name: z.string().max(120), category: z.string().max(60), categories: z.array(z.string().max(60)).max(12), aspectRatio: z.enum(["9:16", "16:9"]), width: z.number(), height: z.number(), durationSeconds: z.number().nullable(), structure: z.array(z.string().max(120)).max(20), coverUrl: z.string(), previewUrl: z.string() });

export async function GET() {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  const rows = await listTemplateFavorites(user.id);
  return Response.json({ templates: rows.map((row) => row.template_json), keys: rows.map((row) => `${row.collection}:${row.template_id}`) });
}

export async function POST(request: Request) {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  const parsed = templateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "模板收藏参数无效" }, { status: 400 });
  const favorite = await saveTemplateFavorite({ userId: user.id, collection: parsed.data.collection, templateId: parsed.data.id, template: parsed.data });
  return Response.json({ favorite });
}

export async function DELETE(request: Request) {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  const query = new URL(request.url).searchParams;
  const collection = query.get("collection"); const id = query.get("id") || "";
  if (!(collection === "expressive" || collection === "production") || !id) return Response.json({ error: "模板参数无效" }, { status: 400 });
  await removeTemplateFavorite(user.id, collection, id);
  return Response.json({ ok: true });
}
