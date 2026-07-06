import { billingPlans } from "@/lib/billing/plans";

export async function GET() {
  return Response.json({ plans: billingPlans });
}
