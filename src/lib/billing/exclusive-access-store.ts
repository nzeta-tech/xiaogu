import { getPool, query } from "../db/client.ts";
import type { ExclusiveAccessMode } from "./exclusive-access-rules.ts";

export type ExclusiveAccessOverride = {
  mode: ExclusiveAccessMode;
  expiresAt: string | null;
  reason: string;
  revision: number;
  updatedBy: string | null;
  updatedAt: string | null;
};
export const defaultExclusiveAccessOverride: ExclusiveAccessOverride = { mode: "auto", expiresAt: null, reason: "", revision: 0, updatedBy: null, updatedAt: null };
const columns = `mode,expires_at as "expiresAt",reason,revision,updated_by as "updatedBy",updated_at as "updatedAt"`;
function normalize(row?: ExclusiveAccessOverride): ExclusiveAccessOverride {
  return row ? { ...row, expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null, updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null } : { ...defaultExclusiveAccessOverride };
}
export async function getExclusiveAccessOverride(userId: string) {
  const result = await query<ExclusiveAccessOverride>(`select ${columns} from exclusive_app_access_overrides where user_id=$1`, [userId]);
  return normalize(result.rows[0]);
}
export async function getExclusiveAccessHistory(userId: string) {
  const result = await query<{ id: string; createdAt: string; operator: string | null; detail: { before: ExclusiveAccessOverride; after: ExclusiveAccessOverride; reason: string } }>(
    `select a.id,a.created_at as "createdAt",u.email as operator,a.detail
     from admin_audit_logs a left join users u on u.id=a.admin_user_id
     where a.action='user.exclusive_app_access.update' and a.target_type='user' and a.target_id=$1
     order by a.created_at desc,a.id desc limit 20`, [userId]);
  return result.rows;
}
export class ExclusiveAccessUpdateError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; this.name = "ExclusiveAccessUpdateError"; }
}
export async function updateExclusiveAccess(input: { userId: string; adminId: string; mode: ExclusiveAccessMode; expiresAt: string | null; reason: string; expectedRevision: number }) {
  const reason = input.reason.trim();
  if (!["auto", "granted", "blocked"].includes(input.mode) || !reason || reason.length > 500 || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw new ExclusiveAccessUpdateError("请填写有效的权限设置和操作原因。", 400);
  if (input.mode !== "granted" && input.expiresAt !== null) throw new ExclusiveAccessUpdateError("只有人工开通可设置有效期。", 400);
  if (input.expiresAt !== null && !(Date.parse(input.expiresAt) > Date.now())) throw new ExclusiveAccessUpdateError("授权到期时间必须晚于当前时间。", 400);
  const client = await getPool().connect();
  try {
    await client.query("begin");
    // Serialize updates even before the first override exists. Recheck the actor
    // within the transaction and lock in stable order to avoid reciprocal edits.
    const users = await client.query<{ id: string; role: string; status: string }>("select id,role,status from users where id=any($1::uuid[]) order by id for update", [[input.userId, input.adminId]]);
    if (!users.rows.some(u => u.id === input.adminId && u.role === "admin" && u.status === "active")) throw new ExclusiveAccessUpdateError("无权修改专享应用权限。", 403);
    if (!users.rows.some(u => u.id === input.userId)) throw new ExclusiveAccessUpdateError("用户不存在。", 404);
    const current = await client.query<ExclusiveAccessOverride>(`select ${columns} from exclusive_app_access_overrides where user_id=$1`, [input.userId]);
    const before = normalize(current.rows[0]);
    if (before.revision !== input.expectedRevision) throw new ExclusiveAccessUpdateError("权限已被其他管理员修改，请刷新后重新设置。", 409);
    const updated = await client.query<ExclusiveAccessOverride>(
      `insert into exclusive_app_access_overrides(user_id,mode,expires_at,reason,updated_by)
       values($1,$2,$3,$4,$5) on conflict(user_id) do update set
       mode=excluded.mode,expires_at=excluded.expires_at,reason=excluded.reason,updated_by=excluded.updated_by,
       revision=exclusive_app_access_overrides.revision+1,updated_at=clock_timestamp() returning ${columns}`,
      [input.userId, input.mode, input.expiresAt, reason, input.adminId]);
    const after = normalize(updated.rows[0]);
    await client.query(
      "insert into admin_audit_logs(admin_user_id,action,target_type,target_id,detail) values($1,'user.exclusive_app_access.update','user',$2,$3::jsonb)",
      [input.adminId, input.userId, JSON.stringify({ before, after, reason })]);
    await client.query("commit");
    return after;
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}
