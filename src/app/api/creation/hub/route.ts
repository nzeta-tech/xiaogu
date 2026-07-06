import { requireSessionUser } from "@/lib/auth/session";
import { tryGetCreationHubData, tryGetCreationWorksView, tryListCreationCatalog, trySyncCreationCatalog } from "@/lib/db/repositories";

export async function GET(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  await trySyncCreationCatalog();

  const url = new URL(request.url);
  const view = url.searchParams.get("view");

  if (view === "works") {
    const works = await tryGetCreationWorksView(user.id);
    if (!works) {
      return Response.json({ error: "作品数据暂不可用" }, { status: 503 });
    }
    return Response.json({ works, mode: "server" });
  }

  const hub = await tryGetCreationHubData(user.id);
  const catalog = await tryListCreationCatalog();
  if (!hub) {
    return Response.json({ error: "广场数据暂不可用" }, { status: 503 });
  }

  return Response.json({
    hub,
    categories: catalog.categories,
    apps: catalog.apps,
    mode: "server",
  });
}
