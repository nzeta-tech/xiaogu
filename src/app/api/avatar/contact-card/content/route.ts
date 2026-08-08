import { requireSessionUser } from "@/lib/auth/session";
import { readAvatarContactQrCode } from "@/lib/avatar/contact-card";
export const runtime = "nodejs";
export async function GET() { const user = await requireSessionUser(); if (user instanceof Response) return user; const qr = await readAvatarContactQrCode(user.id); const bytes = qr?.image_data; if (!bytes?.length) return Response.json({ error: "二维码不存在" }, { status: 404 }); return new Response(new Uint8Array(bytes), { headers: { "content-type": qr?.content_type ?? "image/png", "cache-control": "private, max-age=0, must-revalidate", "x-content-type-options": "nosniff" } }); }
