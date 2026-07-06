import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "@/lib/db/client";
import type { SessionUser } from "./session";

export const authInputSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().email().max(180),
  password: z.string().min(8).max(120),
});

type UserRow = {
  id: string;
  organization_id: string | null;
  name: string;
  email: string;
  password_hash: string;
  role: string;
};

export async function registerUser(input: z.infer<typeof authInputSchema>): Promise<SessionUser> {
  const parsed = authInputSchema.extend({ name: z.string().trim().min(1).max(80) }).parse(input);
  const passwordHash = await bcrypt.hash(parsed.password, 12);

  const org = await query<{ id: string }>("insert into organizations(name) values ($1) returning id", [`${parsed.name}的机构`]);
  const organizationId = org.rows[0].id;

  const user = await query<UserRow>(
    `insert into users(organization_id, name, email, password_hash)
     values ($1, $2, lower($3), $4)
     returning id, organization_id, name, email, password_hash, role`,
    [organizationId, parsed.name, parsed.email, passwordHash],
  );

  await query(
    `insert into broker_profiles(user_id)
     values ($1)
     on conflict (user_id) do update set updated_at = now()`,
    [user.rows[0].id],
  );

  return toSessionUser(user.rows[0]);
}

export async function verifyUser(email: string, password: string): Promise<SessionUser | null> {
  const result = await query<UserRow>(
    "select id, organization_id, name, email, password_hash, role from users where email = lower($1) and status = 'active'",
    [email],
  );
  const user = result.rows[0];
  if (!user) return null;

  const valid = await bcrypt.compare(password, user.password_hash);
  return valid ? toSessionUser(user) : null;
}

function toSessionUser(user: UserRow): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organization_id,
  };
}
