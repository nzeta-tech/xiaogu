import bcrypt from "bcryptjs";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const email = process.env.DEMO_USER_EMAIL ?? "broker@example.com";
const password = process.env.DEMO_USER_PASSWORD ?? "broker123";
const name = process.env.DEMO_USER_NAME ?? "张经纪";

const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  await client.query("begin");

  let organizationId;
  const existingUser = await client.query("select organization_id from users where email = lower($1)", [email]);

  if (existingUser.rows[0]?.organization_id) {
    organizationId = existingUser.rows[0].organization_id;
  } else {
    const org = await client.query("insert into organizations(name) values ($1) returning id", [`${name}的机构`]);
    organizationId = org.rows[0].id;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await client.query(
    `insert into users(organization_id, name, email, password_hash, role, status)
     values ($1, $2, lower($3), $4, 'broker', 'active')
     on conflict (email) do update set
       name = excluded.name,
       password_hash = excluded.password_hash,
       status = 'active',
       updated_at = now()
     returning id, email, name`,
    [organizationId, name, email, passwordHash],
  );

  await client.query(
    `insert into broker_profiles(user_id, compliance_level, display_name, profile_summary)
     values ($1, 'standard', $2, $3)
     on conflict (user_id) do update set
       display_name = excluded.display_name,
       profile_summary = excluded.profile_summary,
       updated_at = now()`,
    [
      user.rows[0].id,
      name,
      "已创建演示账号，建议先完成思维设定以生成结构化个人画像。",
    ],
  );

  await client.query("commit");
  console.log(`seeded demo user: ${user.rows[0].email} / ${password}`);
} catch (error) {
  await client.query("rollback");
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
