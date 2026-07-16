import { tryListBillingPlans } from "@/lib/db/repositories";

export async function GET() {
  const plans = await tryListBillingPlans();
  return Response.json({ plans });
}
