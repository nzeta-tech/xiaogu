import { requireSessionUser } from "@/lib/auth/session";

const WECHAT_API = "https://api.weixin.qq.com/cgi-bin";

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const appId = process.env.WECHAT_OFFICIAL_APP_ID?.trim();
  const secret = process.env.WECHAT_OFFICIAL_APP_SECRET?.trim();
  if (!appId || !secret) {
    return Response.json({ error: "尚未连接公众号。请在服务端配置 WECHAT_OFFICIAL_APP_ID 和 WECHAT_OFFICIAL_APP_SECRET 后再发布。" }, { status: 503 });
  }

  const body = await request.json() as { title?: string; content?: string; cover?: string; images?: Array<string | { url?: string; sectionIndex?: number }>; layout?: string; publish?: boolean };
  const title = body.title?.trim();
  const content = body.content?.trim();
  if (!title || !content) return Response.json({ error: "文章标题和正文不能为空。" }, { status: 400 });
  if (title.length > 64) return Response.json({ error: "公众号标题最多 64 个字。" }, { status: 400 });

  try {
    const token = await getAccessToken(appId, secret);
    const imageInputs = (body.images ?? []).map((item) => typeof item === "string" ? { url: item } : item).filter((item): item is { url: string; sectionIndex?: number } => typeof item.url === "string" && item.url.length > 0).slice(0, 20);
    const contentImages = await Promise.all(imageInputs.map(async (item) => ({ url: await uploadImageForArticle(token, item.url), sectionIndex: item.sectionIndex })));
    const coverSource = body.cover?.trim() || imageInputs[0]?.url;
    if (!coverSource) return Response.json({ error: "请至少生成并保留一张文章配图，才能作为公众号封面发布。" }, { status: 400 });
    const thumbMediaId = await uploadTemporaryImage(token, coverSource);
    const html = articleHtml(content, contentImages, body.layout);
    const draft = await wechatJson<{ media_id?: string; errcode?: number; errmsg?: string }>(`${WECHAT_API}/draft/add?access_token=${token}`, {
      articles: [{ title, author: "", digest: "", content: html, content_source_url: "", thumb_media_id: thumbMediaId, need_open_comment: 0, only_fans_can_comment: 0 }],
    });
    if (!draft.media_id) throw new Error(draft.errmsg || "公众号草稿创建失败。");
    if (!body.publish) return Response.json({ status: "draft", message: "已存入公众号草稿箱，可在公众号后台继续调整后发布。", mediaId: draft.media_id });

    const published = await wechatJson<{ publish_id?: string; errcode?: number; errmsg?: string }>(`${WECHAT_API}/freepublish/submit?access_token=${token}`, { media_id: draft.media_id });
    if (!published.publish_id) throw new Error(published.errmsg || "草稿已创建，但提交发布失败。请到公众号草稿箱继续发布。");
    return Response.json({ status: "published", message: "已提交公众号发布，通常需要一点时间审核和同步。", publishId: published.publish_id });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "公众号发布失败，请稍后重试。" }, { status: 502 });
  }
}

async function getAccessToken(appId: string, secret: string) {
  const url = new URL(`${WECHAT_API}/token`);
  url.searchParams.set("grant_type", "client_credential"); url.searchParams.set("appid", appId); url.searchParams.set("secret", secret);
  const payload = await fetch(url, { cache: "no-store" }).then((response) => response.json()) as { access_token?: string; errmsg?: string };
  if (!payload.access_token) throw new Error(payload.errmsg || "未能取得公众号访问凭证。请检查 AppID、AppSecret 与服务器 IP 白名单。 ");
  return payload.access_token;
}

async function uploadImageForArticle(token: string, source: string) {
  const file = await imageBlob(source);
  const data = new FormData(); data.append("media", file, "article-image.jpg");
  const response = await fetch(`${WECHAT_API}/media/uploadimg?access_token=${token}`, { method: "POST", body: data });
  const payload = await response.json() as { url?: string; errmsg?: string };
  if (!payload.url) throw new Error(payload.errmsg || "文章配图上传到公众号失败。 ");
  return payload.url;
}

async function uploadTemporaryImage(token: string, source: string) {
  const file = await imageBlob(source);
  const data = new FormData(); data.append("media", file, "cover.jpg");
  const response = await fetch(`${WECHAT_API}/media/upload?access_token=${token}&type=image`, { method: "POST", body: data });
  const payload = await response.json() as { media_id?: string; errmsg?: string };
  if (!payload.media_id) throw new Error(payload.errmsg || "封面上传到公众号失败。 ");
  return payload.media_id;
}

async function imageBlob(source: string) {
  const response = await fetch(source, { signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error("无法读取生成的配图，请重新生成后再试。 ");
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("配图格式不正确，请重新生成。 ");
  return blob;
}

async function wechatJson<T extends { errcode?: number; errmsg?: string }>(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json() as T;
  if (!response.ok || (payload.errcode !== undefined && payload.errcode !== 0)) throw new Error(payload.errmsg || "公众号接口请求失败。 ");
  return payload;
}

function articleHtml(content: string, images: Array<{ url: string; sectionIndex?: number }>, layout = "clean") {
  const theme = layout === "magazine"
    ? { section: "margin:28px 0;", heading: "font-size:22px;font-weight:700;border-bottom:2px solid #233e35;padding-bottom:10px;", paragraph: "font-size:16px;line-height:1.9;color:#2f3d38;" }
    : layout === "card"
      ? { section: "margin:20px 0;padding:18px;border:1px solid #dce8e3;border-radius:12px;background:#f8fcfa;", heading: "font-size:20px;font-weight:700;color:#175d49;", paragraph: "font-size:16px;line-height:1.9;color:#30443d;" }
      : layout === "notebook"
        ? { section: "margin:22px 0;padding:18px;background:#fbf6ea;border-radius:10px;", heading: "font-size:20px;font-weight:700;color:#665130;", paragraph: "font-size:16px;line-height:1.9;color:#534b3c;" }
        : layout === "minimal"
          ? { section: "margin:30px 0;", heading: "font-size:20px;font-weight:700;text-align:center;border-bottom:1px solid #d9dfdc;padding-bottom:12px;color:#222;", paragraph: "font-size:16px;line-height:2;color:#333;" }
          : layout === "newspaper"
            ? { section: "margin:22px 0;padding:18px;border-top:3px double #423f39;border-bottom:3px double #423f39;font-family:serif;", heading: "font-size:20px;font-weight:700;border-top:1px solid #817b72;border-bottom:1px solid #817b72;padding:8px 0;color:#211f1c;", paragraph: "font-size:16px;line-height:1.9;color:#2e2b27;" }
            : layout === "warm"
              ? { section: "margin:22px 0;padding:20px;background:#fff8ed;border-radius:12px;", heading: "font-size:20px;font-weight:700;border-left:4px solid #d5895b;padding-left:10px;color:#8b4f32;", paragraph: "font-size:16px;line-height:1.95;color:#5c493d;" }
              : layout === "dark"
                ? { section: "margin:0;padding:22px;background:#18201e;", heading: "font-size:20px;font-weight:700;border-left:4px solid #d9b76b;padding-left:10px;color:#f0d69b;", paragraph: "font-size:16px;line-height:1.95;color:#f3f4ef;" }
        : { section: "margin:22px 0;", heading: "font-size:20px;font-weight:700;border-left:4px solid #159879;padding-left:10px;color:#173d31;", paragraph: "font-size:16px;line-height:1.95;color:#2f403a;" };
  const sections = content.replace(/\r/g, "").split(/(?=^##\s+)/m).filter((section) => section.trim());
  const used = new Set<number>();
  const imageHtml = (image: { url: string }) => `<p style="margin:22px 0;"><img src="${image.url}" style="width:100%;height:auto;border-radius:8px;" /></p>`;
  const before = images.map((image, index) => ({ image, index })).filter(({ image }) => image.sectionIndex === -1);
  before.forEach(({ index }) => used.add(index));
  const html = sections.map((section, sectionIndex) => {
    const paragraphs = section.split(/\n{2,}/).filter(Boolean);
    const blocks = paragraphs.map((paragraph) => {
      const headingMatch = paragraph.match(/^#{2,3}\s+(.+)/);
      const text = escapeHtml(headingMatch ? headingMatch[1] : paragraph.replace(/\*\*(.*?)\*\*/g, "$1")).replace(/\n/g, "<br/>");
      return headingMatch ? `<h2 style="${theme.heading}">${text}</h2>` : `<p style="${theme.paragraph}">${text}</p>`;
    }).join("");
    let placed = images.map((image, index) => ({ image, index })).filter(({ image, index }) => !used.has(index) && image.sectionIndex === sectionIndex);
    if (!placed.length) {
      const automaticIndex = images.findIndex((image, index) => !used.has(index) && image.sectionIndex === undefined);
      if (automaticIndex >= 0) placed = [{ image: images[automaticIndex], index: automaticIndex }];
    }
    placed.forEach(({ index }) => used.add(index));
    return `<section style="${theme.section}">${blocks}${placed.map(({ image }) => imageHtml(image)).join("")}</section>`;
  }).join("");
  const remaining = images.filter((_, index) => !used.has(index)).map(imageHtml).join("");
  return before.map(({ image }) => imageHtml(image)).join("") + html + remaining;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
