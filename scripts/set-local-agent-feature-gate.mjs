import pg from "pg";

const action = process.argv[2];
if (!new Set(["enable", "disable", "status"]).has(action)) {
  console.error("Usage: node scripts/set-local-agent-feature-gate.mjs <enable|disable|status>");
  process.exit(1);
}

const connectionString = process.env.RDS_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("RDS_DATABASE_URL or DATABASE_URL is required");

const client = new pg.Client({ connectionString });
await client.connect();
try {
  if (action === "enable") {
    const compatible = await client.query(
      `select agent_id,version from local_agent_nodes
       where status in ('ready','busy')
         and protocol_version=1
         and last_seen_at > now()-interval '45 seconds'
         and capabilities->>'source.inspect'='true'
         and health->>'executor'='healthy'
         and health->>'transcriber'='healthy'
         and health->>'chromium'='healthy'
         and health->>'wechatChannel'='healthy'
         and health->>'ytDlp'='healthy'
       order by last_seen_at desc limit 1`,
    );
    if (!compatible.rows[0]) throw new Error("No protocol-compatible healthy production Agent heartbeat was found");
  }

  if (action !== "status") {
    const enabled = action === "enable";
    await client.query(
      `insert into system_settings(setting_key,setting_value,updated_at)
       values('features',jsonb_build_object('localAgentEnabled',$1::boolean),now())
       on conflict(setting_key) do update set
         setting_value=system_settings.setting_value || jsonb_build_object('localAgentEnabled',$1::boolean),
         updated_at=now()`,
      [enabled],
    );
  }

  const current = await client.query(
    `select coalesce((setting_value->>'localAgentEnabled')::boolean,false) as enabled,updated_at
     from system_settings where setting_key='features'`,
  );
  console.log(JSON.stringify(current.rows[0] ?? { enabled: false, updated_at: null }));
} finally {
  await client.end();
}
