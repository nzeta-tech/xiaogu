import bcrypt from "bcryptjs";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: databaseUrl });
const marker = process.env.REGRESSION_MARKER ?? "codex-regression";
const password = process.env.REGRESSION_PASSWORD ?? "Regression123!";
const mode = process.argv[2] ?? "setup";

if (mode === "cleanup") {
  const users = await pool.query("select id, organization_id from users where email like $1", [`${marker}-%@example.com`]);
  for (const user of users.rows) {
    await pool.query("delete from users where id = $1", [user.id]);
    if (user.organization_id) await pool.query("delete from organizations where id = $1 and not exists (select 1 from users where organization_id = $1)", [user.organization_id]);
  }
  await pool.query("delete from announcements where title like $1", [`${marker}%`]);
  await pool.query("delete from promo_codes where code like $1", ["CODEXREG%"]);
  console.log(JSON.stringify({ cleanedUsers: users.rowCount }));
  await pool.end();
  process.exit(0);
}

const suffix = Date.now();
const passwordHash = await bcrypt.hash(password, 12);
async function createUser(role) {
  const email = `${marker}-${role}-${suffix}@example.com`;
  const org = await pool.query("insert into organizations(name) values ($1) returning id", [`${marker}-${role}`]);
  const user = await pool.query(
    `insert into users(organization_id, name, email, password_hash, role, status) values ($1, $2, $3, $4, $5, 'active') returning id, email, name, role`,
    [org.rows[0].id, role === "admin" ? "回归管理员" : "回归用户", email, passwordHash, role],
  );
  await pool.query("update users set email_verified_at=now(),terms_accepted_at=now() where id=$1", [user.rows[0].id]);
  await pool.query("insert into broker_profiles(user_id, display_name) values ($1, $2) on conflict (user_id) do nothing", [user.rows[0].id, user.rows[0].name]);
  return user.rows[0];
}
const broker = await createUser("broker");
const admin = await createUser("admin");
await pool.query("insert into gift_records(user_id, source_type, source_label, quota_amount, status) values ($1, 'regression', $2, 500, 'granted')", [broker.id, marker]);
console.log(JSON.stringify({ marker, password, broker, admin }));
await pool.end();
