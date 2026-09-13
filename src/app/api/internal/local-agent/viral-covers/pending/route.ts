import { requireLocalAgent } from "@/lib/local-agent/auth";
import { query } from "@/lib/db/client";

export async function GET(request: Request) {
  const agent = requireLocalAgent(request);
  if (agent instanceof Response) return agent;
  const result = await query<{ id: string; source_url: string; thumbnail_url: string | null }>(
    `select content.id,content.source_url,content.thumbnail_url
     from viral_contents content
     left join viral_content_cover_assets cover on cover.viral_content_id=content.id
     where content.status='published'
       and (content.publish_at is null or content.publish_at<=now())
       and (content.expire_at is null or content.expire_at>now())
       and (cover.viral_content_id is null or octet_length(cover.image_data) < 1024)
     order by content.is_pinned desc,content.is_featured desc,content.sort_order asc
     limit 100`,
  );
  return Response.json({ items: result.rows.map((row) => ({ id: row.id, sourceUrl: row.source_url, thumbnailUrl: row.thumbnail_url ?? "" })) });
}
