import { requireSessionUser } from "@/lib/auth/session";
import { tryGetCreationHubData, tryGetCreationWorksView, tryListCreationCatalog, trySyncCreationCatalog } from "@/lib/db/repositories";
import { getLinkRemixAvailability, getPptAvailability } from "@/lib/local-agent/repository";

export async function GET(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  await trySyncCreationCatalog();

  const url = new URL(request.url);
  const view = url.searchParams.get("view");

  if (view === "works") {
    const page = Number(url.searchParams.get("page") || "1");
    const pageSize = Number(url.searchParams.get("pageSize") || "20");
    const stateValue = url.searchParams.get("state") || "all";
    const sortValue = url.searchParams.get("sort") || "updated-desc";
    const state = ["all", "favorite", "noted", "avatar"].includes(stateValue)
      ? stateValue as "all" | "favorite" | "noted" | "avatar"
      : "all";
    const sort = ["updated-desc", "updated-asc", "created-desc"].includes(sortValue)
      ? sortValue as "updated-desc" | "updated-asc" | "created-desc"
      : "updated-desc";
    const works = await tryGetCreationWorksView(user.id, {
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 20,
      search: url.searchParams.get("search") || undefined,
      platform: url.searchParams.get("platform") || undefined,
      state,
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
      sort,
    });
    if (!works) {
      return Response.json({ error: "作品数据暂不可用" }, { status: 503 });
    }
    return Response.json({ works, mode: "server" });
  }

  const hub = await tryGetCreationHubData(user.id);
  const catalog = await tryListCreationCatalog();
  const [linkRemix, pptMaker] = await Promise.all([getLinkRemixAvailability(), getPptAvailability()]);
  if (!hub) {
    return Response.json({ error: "广场数据暂不可用" }, { status: 503 });
  }

  return Response.json({
    hub,
    categories: catalog.categories,
    apps: catalog.apps,
    appRuntime: { "link-remix": linkRemix, "ppt-maker": pptMaker },
    mode: "server",
  });
}
