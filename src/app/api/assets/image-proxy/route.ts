import { requireSessionUser } from "@/lib/auth/session";

export async function GET(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { searchParams } = new URL(request.url);
  const sourceUrl = searchParams.get("url")?.trim();
  if (!sourceUrl) {
    return Response.json({ error: "缺少图片地址" }, { status: 400 });
  }

  let remoteUrl: URL;
  try {
    remoteUrl = new URL(sourceUrl);
  } catch {
    return Response.json({ error: "图片地址不合法" }, { status: 400 });
  }

  if (remoteUrl.protocol !== "http:" && remoteUrl.protocol !== "https:") {
    return Response.json({ error: "仅支持 http/https 图片地址" }, { status: 400 });
  }

  try {
    const response = await fetch(remoteUrl.toString(), {
      headers: {
        accept: "image/*,*/*;q=0.8",
        "user-agent": "insurance-content-agent/1.0",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return Response.json({ error: "图片拉取失败" }, { status: 502 });
    }

    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return Response.json({ error: "远程资源不是图片" }, { status: 415 });
    }

    const buffer = await response.arrayBuffer();
    return new Response(buffer, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "private, no-store, max-age=0",
      },
    });
  } catch {
    return Response.json({ error: "图片代理失败" }, { status: 502 });
  }
}
