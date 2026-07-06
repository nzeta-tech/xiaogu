import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { tryGetBrokerProfile, tryGetLatestThinkingProfileSnapshot, tryUpdateBrokerProfile } from "@/lib/db/repositories";
import { buildThinkingProfileBrief } from "@/lib/thinking/profile-snapshot";

const profileSchema = z.object({
  persona: z.string().trim().min(1).max(500),
  targetAudience: z.string().trim().min(1).max(500),
  specialty: z.string().trim().min(1).max(500),
  topicPreference: z.string().trim().max(500).optional().default(""),
});

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const [profile, thinkingSnapshot] = await Promise.all([tryGetBrokerProfile(user.id), tryGetLatestThinkingProfileSnapshot(user.id)]);
  if (!profile && !thinkingSnapshot) {
    return Response.json({ error: "账号画像不存在，请先完成思维设定" }, { status: 404 });
  }

  const brief = thinkingSnapshot?.snapshot_json
    ? buildThinkingProfileBrief(thinkingSnapshot.snapshot_json, thinkingSnapshot.summary_json)
    : null;

  return Response.json({
    profile: profile ?? null,
    mode: "server",
    compatibilityMode: true,
    derivedProfile: brief
      ? {
          persona: brief.persona,
          targetAudience: brief.targetAudience,
          specialty: brief.specialty,
          topicPreference: brief.topicPreference,
        }
      : null,
  });
}

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const input = profileSchema.parse(await request.json());
  const profile = await tryUpdateBrokerProfile({
    userId: user.id,
    profileSummary: [input.persona, input.targetAudience, input.specialty, input.topicPreference].filter(Boolean).join("\n"),
  });

  if (!profile) {
    return Response.json({ error: "账号人设保存失败，请检查数据库连接" }, { status: 503 });
  }

  return Response.json({
    ok: true,
    profile,
    mode: "server",
  });
}
