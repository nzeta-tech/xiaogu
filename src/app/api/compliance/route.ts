import { getQuotaCost } from "@/lib/billing/quota";
import { requireSessionUser } from "@/lib/auth/session";
import { getMeteringMode, reportUsage } from "@/lib/billing/openmeter";
import { checkCompliance } from "@/lib/compliance/check";
import { tryGetSystemSettings, trySaveComplianceReport, trySaveUsageLog } from "@/lib/db/repositories";
import { requireQuota } from "@/lib/billing/enforce";

export async function POST(request: Request) {
  const body = (await request.json()) as { text?: string; content?: string; draftId?: string };
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (!(await tryGetSystemSettings()).features.complianceEnabled) return Response.json({ error: "合规预检功能当前已关闭" }, { status: 403 });

  const quota = await requireQuota(user, "compliance_check");
  if (!quota.ok) return quota.response;

  const checkedText = body.text ?? body.content ?? "";
  const report = checkCompliance(checkedText);
  const quotaCost = getQuotaCost("compliance_check");

  await reportUsage({
    customerId: user.id,
    action: "compliance_check",
    amount: quotaCost,
    metadata: { riskLevel: report.riskLevel },
  });
  const reportId = await trySaveComplianceReport({
    userId: user.id,
    draftId: body.draftId,
    riskLevel: report.riskLevel,
    issues: report.issues,
    checkedText,
  });
  await trySaveUsageLog({
    userId: user.id,
    actionType: "compliance_check",
    quotaCost,
    metadata: { reportId, riskLevel: report.riskLevel, meteringMode: getMeteringMode() },
  });

  return Response.json({
    report,
    reportId,
    usage: {
      action: "compliance_check",
      quotaCost,
      meteringMode: getMeteringMode(),
    },
  });
}
