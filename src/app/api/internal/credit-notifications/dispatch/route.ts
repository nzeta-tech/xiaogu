import { dispatchCreditChangeEmails } from "@/lib/billing/notifications";

export async function POST(request: Request) {
  const expected = process.env.CREDIT_NOTIFICATION_SECRET || process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ ok: true, ...(await dispatchCreditChangeEmails()) });
}
