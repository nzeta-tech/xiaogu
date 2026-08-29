import { requireSessionUser } from "@/lib/auth/session";
import { query } from "@/lib/db/client";

type CoachOption = {
  id: string;
  name: string;
  version: number;
  coach_scope: "personal" | "platform";
  identity_card: { title?: string; summary?: string; scenarios?: string[]; styleTags?: string[]; bestFor?: string };
  capabilities: string[];
};

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const coaches = await query<CoachOption>(
    `select versions.id, coaches.name, versions.version, coaches.coach_scope, coaches.identity_card,
            array_remove(array[
              case when length(versions.ip_positioning_prompt)>0 then 'IP定位' end,
              case when length(versions.content_creation_prompt)>0 then '内容创作' end,
              case when length(versions.growth_prompt)>0 then '获客增长' end
            ], null) as capabilities
       from creative_coach_versions versions
       join creative_coaches coaches on coaches.id=versions.coach_id
      where coaches.status='active' and coaches.is_system=false and versions.status in ('active','restored')
        and (coaches.coach_scope='platform' or (coaches.coach_scope='personal' and coaches.user_id=$1))
      order by case when coaches.coach_scope='personal' then 0 else 1 end, coaches.updated_at desc, versions.version desc`,
    [user.id],
  ).catch(() => ({ rows: [] as CoachOption[] }));

  return Response.json({ coaches: coaches.rows }, { headers: { "cache-control": "private, no-store, max-age=0" } });
}
