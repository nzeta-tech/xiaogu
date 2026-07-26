import { requireSessionUser } from "@/lib/auth/session";
import { query } from "@/lib/db/client";

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权查看支付统计" }, { status: 403 });
  try {
    const [summary, methods, providers, daily] = await Promise.all([
      query(`select count(*)::int as orders, count(*) filter(where status in ('paid','completed'))::int as successful,
        coalesce(sum(amount_cents) filter(where status in ('paid','completed')),0)::int as revenue,
        coalesce(sum(amount_cents) filter(where status='refunded'),0)::int as refunded from orders`),
      query(`select provider, coalesce(payment_method,provider) as payment_method, count(*)::int as orders, coalesce(sum(amount_cents) filter(where status in ('paid','completed')),0)::int as revenue from orders group by provider,payment_method order by revenue desc`),
      query(`select coalesce(pp.name,o.provider) as provider, count(*)::int as orders, coalesce(sum(o.amount_cents) filter(where o.status in ('paid','completed')),0)::int as revenue from orders o left join payment_provider_instances pp on pp.id=o.provider_instance_id group by coalesce(pp.name,o.provider) order by revenue desc`),
      query(`select (created_at at time zone 'Asia/Shanghai')::date as day, count(*)::int as orders, coalesce(sum(amount_cents) filter(where status in ('paid','completed')),0)::int as revenue from orders where created_at > now()-interval '30 days' group by day order by day`),
    ]);
    return Response.json({ summary: summary.rows[0], methods: methods.rows, providers: providers.rows, daily: daily.rows });
  } catch { return Response.json({ error: "支付统计暂不可用" }, { status: 503 }); }
}
