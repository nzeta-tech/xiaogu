import { requireSessionUser } from "@/lib/auth/session";
import { query } from "@/lib/db/client";

type SkillOption = {
  id: string;
  name: string;
  version: number;
  skill_scope: "personal" | "platform";
  identity_card: { title?: string; summary?: string; scenarios?: string[]; styleTags?: string[]; bestFor?: string };
};

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const result = await query<SkillOption>(
    `select versions.id, skills.name, versions.version, skills.skill_scope, skills.identity_card
     from avatar_creator_skill_versions versions
     join avatar_creator_skills skills on skills.id = versions.skill_id
     where skills.status = 'active'
       and versions.status in ('active', 'restored')
       and (skills.skill_scope = 'platform' or (skills.skill_scope = 'personal' and skills.user_id = $1))
     order by case when skills.skill_scope = 'personal' then 0 else 1 end, skills.updated_at desc, versions.version desc`,
    [user.id],
  );

  return Response.json({ skills: result.rows }, { headers: { "cache-control": "private, no-store, max-age=0" } });
}
