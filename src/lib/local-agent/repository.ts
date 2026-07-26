import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool, query } from "@/lib/db/client";
import { LOCAL_AGENT_PROTOCOL_VERSION, type LinkRemixAvailability, type LocalAgentHeartbeat, type LocalAgentTask, type LocalAgentTaskEvent, type LocalAgentTaskEventType, type LocalAgentTaskType } from "@/lib/local-agent/contracts";

type TaskRow = {
  id: string; task_type: LocalAgentTaskType; status: LocalAgentTask["status"]; priority: number;
  payload: Record<string, unknown>; result: Record<string, unknown> | null; error_message: string | null;
  attempt_count: number; max_attempts: number; created_at: string; updated_at: string;
};

const taskColumns = "id,task_type,status,priority,payload,result,error_message,attempt_count,max_attempts,created_at,updated_at";

export async function recordLocalAgentHeartbeat(input: LocalAgentHeartbeat) {
  await query(
    `insert into local_agent_nodes(agent_id,status,version,protocol_version,capabilities,health,active_task_count,started_at,last_seen_at,updated_at)
     values($1,$2,$3,$4,$5,$6,$7,now(),now(),now())
     on conflict(agent_id) do update set status=excluded.status,version=excluded.version,
       protocol_version=excluded.protocol_version,capabilities=excluded.capabilities,health=excluded.health,active_task_count=excluded.active_task_count,
       last_seen_at=now(),updated_at=now()`,
    [input.agentId, input.status, input.version, input.protocolVersion, input.capabilities, input.health, input.activeTaskCount],
  );
}

export async function isLocalAgentDelegationEnabled() {
  if (process.env.LOCAL_AGENT_ENABLED !== "1") return false;
  const result = await query<{ enabled: boolean }>(
    `select coalesce((setting_value->>'localAgentEnabled')::boolean,false) as enabled
     from system_settings where setting_key='features' limit 1`,
  ).catch(() => ({ rows: [] as Array<{ enabled: boolean }> }));
  return result.rows[0]?.enabled === true;
}

export async function getLinkRemixAvailability(): Promise<LinkRemixAvailability> {
  if (process.env.LOCAL_AGENT_ENABLED !== "1") {
    return { available: true, reason: "", lastSeenAt: null, enabled: true, protocolVersion: LOCAL_AGENT_PROTOCOL_VERSION };
  }
  if (!await isLocalAgentDelegationEnabled()) {
    return { available: false, reason: "功能暂不可用", lastSeenAt: null, enabled: false, protocolVersion: LOCAL_AGENT_PROTOCOL_VERSION };
  }
  const timeoutSeconds = Math.min(Math.max(Number(process.env.LOCAL_AGENT_OFFLINE_AFTER_SECONDS) || 45, 20), 300);
  const result = await query<{ last_seen_at: string }>(
    `select last_seen_at from local_agent_nodes
     where status in ('ready','busy')
       and last_seen_at > now()-($1||' seconds')::interval
       and capabilities->>'source.inspect'='true'
       and protocol_version=$2
       and health->>'executor'='healthy'
       and health->>'transcriber'='healthy'
       and health->>'chromium'='healthy'
       and health->>'wechatChannel'='healthy'
       and health->>'ytDlp'='healthy'
     order by last_seen_at desc limit 1`,
    [timeoutSeconds, LOCAL_AGENT_PROTOCOL_VERSION],
  ).catch(() => ({ rows: [] as Array<{ last_seen_at: string }> }));
  const row = result.rows[0];
  return row
    ? { available: true, reason: "", lastSeenAt: row.last_seen_at, enabled: true, protocolVersion: LOCAL_AGENT_PROTOCOL_VERSION }
    : { available: false, reason: "功能暂不可用", lastSeenAt: null, enabled: true, protocolVersion: LOCAL_AGENT_PROTOCOL_VERSION };
}

export async function getLocalAgentReleaseStatus() {
  const enabled = await isLocalAgentDelegationEnabled();
  const nodes = await query<{
    agent_id: string; status: string; version: string; protocol_version: number;
    capabilities: Record<string, boolean>; health: Record<string, string>; active_task_count: number; last_seen_at: string;
  }>(
    `select agent_id,status,version,protocol_version,capabilities,health,active_task_count,last_seen_at
     from local_agent_nodes order by last_seen_at desc limit 20`,
  ).then((result) => result.rows).catch(() => []);
  return { enabled, protocolVersion: LOCAL_AGENT_PROTOCOL_VERSION, nodes };
}

export async function enqueueLocalAgentTask(input: {
  taskType: LocalAgentTaskType; ownerUserId?: string | null; payload: Record<string, unknown>;
  dedupeKey?: string | null; priority?: number; maxAttempts?: number;
}) {
  const result = await query<TaskRow>(
    `insert into local_agent_tasks(task_type,owner_user_id,payload,dedupe_key,priority,max_attempts)
     values($1,$2,$3,$4,$5,$6)
     on conflict (task_type,dedupe_key) where dedupe_key is not null and status in ('pending','leased')
     do update set priority=greatest(local_agent_tasks.priority,excluded.priority),updated_at=now()
     returning ${taskColumns}`,
    [input.taskType, input.ownerUserId ?? null, input.payload, input.dedupeKey ?? null, input.priority ?? 0, input.maxAttempts ?? 3],
  );
  return mapTask(result.rows[0]);
}

export async function getOwnedLocalAgentTask(id: string, userId: string) {
  const result = await query<TaskRow>(`select ${taskColumns} from local_agent_tasks where id=$1 and owner_user_id=$2`, [id, userId]);
  return result.rows[0] ? mapTask(result.rows[0]) : null;
}

export async function leaseLocalAgentTask(input: { agentId: string; capabilities: LocalAgentTaskType[]; leaseSeconds: number }) {
  if (input.capabilities.length === 0) return null;
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await recoverExpiredLeases(client);
    const selected = await client.query<TaskRow>(
      `select ${taskColumns} from local_agent_tasks
       where status='pending' and available_at<=now() and task_type=any($1::text[]) and attempt_count<max_attempts
       order by priority desc,created_at asc for update skip locked limit 1`,
      [input.capabilities],
    );
    if (!selected.rows[0]) {
      await client.query("commit");
      return null;
    }
    const leaseToken = randomBytes(32).toString("base64url");
    const updated = await client.query<TaskRow>(
      `update local_agent_tasks set status='leased',agent_id=$2,lease_token_hash=$3,
       lease_expires_at=now()+($4||' seconds')::interval,attempt_count=attempt_count+1,updated_at=now()
       where id=$1 returning ${taskColumns}`,
      [selected.rows[0].id, input.agentId, hashToken(leaseToken), input.leaseSeconds],
    );
    await client.query(
      `insert into local_agent_task_events(task_id,attempt_count,event_type,payload)
       values($1,$2,'reset',$3)`,
      [updated.rows[0].id, updated.rows[0].attempt_count, { message: "本地 Agent 已领取任务。" }],
    );
    await client.query("commit");
    return { task: mapTask(updated.rows[0]), leaseToken, leaseExpiresInSeconds: input.leaseSeconds };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function appendLocalAgentTaskEvent(input: {
  id: string; agentId: string; leaseToken: string; eventType: LocalAgentTaskEventType; payload: Record<string, unknown>;
}) {
  const result = await query<{ id: string }>(
    `insert into local_agent_task_events(task_id,attempt_count,event_type,payload)
     select id,attempt_count,$4,$5 from local_agent_tasks
     where id=$1 and status='leased' and agent_id=$2 and lease_token_hash=$3 and lease_expires_at>now()
     returning task_id as id`,
    [input.id, input.agentId, hashToken(input.leaseToken), input.eventType, input.payload],
  );
  return Boolean(result.rows[0]);
}

export async function listOwnedLocalAgentTaskEvents(input: { id: string; userId: string; afterId: number; limit?: number }) {
  const result = await query<{
    id: string; task_id: string; attempt_count: number; event_type: LocalAgentTaskEventType;
    payload: Record<string, unknown>; created_at: string;
  }>(
    `select event.id::text,event.task_id,event.attempt_count,event.event_type,event.payload,event.created_at
     from local_agent_task_events event
     join local_agent_tasks task on task.id=event.task_id
     where event.task_id=$1 and task.owner_user_id=$2 and event.id>$3
     order by event.id asc limit $4`,
    [input.id, input.userId, Math.max(0, input.afterId), Math.min(Math.max(input.limit ?? 100, 1), 500)],
  );
  return result.rows.map((row): LocalAgentTaskEvent => ({
    id: Number(row.id), taskId: row.task_id, attemptCount: row.attempt_count,
    eventType: row.event_type, payload: row.payload, createdAt: row.created_at,
  }));
}

export async function heartbeatLocalAgentTask(id: string, agentId: string, leaseToken: string, leaseSeconds: number) {
  const result = await query<{ id: string }>(
    `update local_agent_tasks set lease_expires_at=now()+($4||' seconds')::interval,updated_at=now()
     where id=$1 and status='leased' and agent_id=$2 and lease_token_hash=$3 and lease_expires_at>now() returning id`,
    [id, agentId, hashToken(leaseToken), leaseSeconds],
  );
  return Boolean(result.rows[0]);
}

export async function completeLocalAgentTask(id: string, agentId: string, leaseToken: string, resultPayload: Record<string, unknown>) {
  const result = await query<{ id: string }>(
    `update local_agent_tasks set status='succeeded',result=$4,error_message=null,completed_at=now(),
     lease_token_hash=null,lease_expires_at=null,updated_at=now()
     where id=$1 and status='leased' and agent_id=$2 and lease_token_hash=$3 and lease_expires_at>now() returning id`,
    [id, agentId, hashToken(leaseToken), resultPayload],
  );
  return Boolean(result.rows[0]);
}

export async function failLocalAgentTask(id: string, agentId: string, leaseToken: string, errorMessage: string, retryable: boolean) {
  const result = await query<{ id: string }>(
    `update local_agent_tasks set
       status=case when $5 and attempt_count<max_attempts then 'pending' else 'failed' end,
       error_message=$4,available_at=case when $5 then now()+least(attempt_count*30,300)*interval '1 second' else available_at end,
       completed_at=case when $5 and attempt_count<max_attempts then null else now() end,
       agent_id=null,lease_token_hash=null,lease_expires_at=null,updated_at=now()
     where id=$1 and status='leased' and agent_id=$2 and lease_token_hash=$3 returning id`,
    [id, agentId, hashToken(leaseToken), errorMessage.slice(0, 2000), retryable],
  );
  return Boolean(result.rows[0]);
}

async function recoverExpiredLeases(client: PoolClient) {
  await client.query("delete from local_agent_task_events where created_at < now()-interval '7 days'");
  await client.query(
    `update local_agent_tasks set
       status=case when attempt_count<max_attempts then 'pending' else 'failed' end,
       error_message=case when attempt_count<max_attempts then error_message else coalesce(error_message,'Agent lease expired') end,
       completed_at=case when attempt_count<max_attempts then null else now() end,
       agent_id=null,lease_token_hash=null,lease_expires_at=null,updated_at=now()
     where status='leased' and lease_expires_at<=now()`,
  );
}

function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
function mapTask(row: TaskRow): LocalAgentTask {
  return { id: row.id, taskType: row.task_type, status: row.status, priority: row.priority, payload: row.payload,
    result: row.result, errorMessage: row.error_message, attemptCount: row.attempt_count, maxAttempts: row.max_attempts,
    createdAt: row.created_at, updatedAt: row.updated_at };
}
