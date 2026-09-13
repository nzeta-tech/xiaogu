import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { query } from "@/lib/db/client";

type Module = { key: string; title: string; objective: string; practice: string };
const progressSchema = z.object({ courseId: z.string().uuid(), moduleKey: z.string().min(1).max(80), status: z.enum(["started", "completed"]) });

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  try {
    const [courses, memories] = await Promise.all([
      query<{ id: string; skill_id: string; title: string; summary: string; modules_json: Module[]; identity_card: { scenarios?: string[]; styleTags?: string[]; bestFor?: string }; completed_keys: string[] }>(
        `select c.id, c.skill_id, c.title, c.summary, c.modules_json, s.identity_card,
          coalesce(array_agg(p.module_key) filter (where p.status='completed'), '{}') as completed_keys
         from avatar_coach_courses c join avatar_creator_skills s on s.id=c.skill_id
         left join avatar_coach_course_progress p on p.course_id=c.id and p.user_id=$1
         where c.status='active' and s.status='active' and s.skill_scope='platform' and s.training_purpose='lead-coach'
         group by c.id, s.id order by c.updated_at desc`, [user.id]),
      query<{ content: string }>(`select content from avatar_memory_items where user_id=$1 and status='active' order by updated_at desc limit 40`, [user.id]),
    ]);
    const profileText = memories.rows.map((item) => item.content).join(" ").toLowerCase();
    const results = courses.rows.map((course) => {
      const tags = [...(course.identity_card?.scenarios ?? []), ...(course.identity_card?.styleTags ?? []), course.identity_card?.bestFor ?? ""].filter(Boolean);
      const matched = tags.filter((tag) => profileText.includes(tag.toLowerCase()));
      const score = Math.min(96, 58 + matched.length * 12 + (profileText.length > 100 ? 8 : 0));
      return { ...course, modules: course.modules_json ?? [], matchScore: score, matchReasons: matched.length ? matched.slice(0, 3).map((tag) => `你的数字分身提到「${tag}」`) : ["依据你的目标客群、表达偏好与当前记忆推荐", "可手动选择其他教练"] };
    }).sort((a, b) => b.matchScore - a.matchScore);
    return Response.json({ courses: results });
  } catch { return Response.json({ error: "教练与课程暂时无法加载" }, { status: 503 }); }
}

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const parsed = progressSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "学习进度不完整" }, { status: 400 });
  const input = parsed.data;
  await query(`insert into avatar_coach_course_progress(user_id, course_id, module_key, status) values ($1,$2,$3,$4)
    on conflict (user_id, course_id, module_key) do update set status=excluded.status, updated_at=now()`, [user.id, input.courseId, input.moduleKey, input.status]);
  return Response.json({ ok: true });
}
