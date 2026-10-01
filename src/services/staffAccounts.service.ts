import bcrypt from 'bcrypt';
import { query, withTransaction } from '../db/postgres/client';
import { MIN_ADMIN_PASSWORD_CHARS } from './adminUsers.service';

/**
 * M1 (plate v288; Misho, 1 October): admin logins of their own for the team, so
 * each person signs in as themselves and their entries carry their name.
 *
 * A staff account is a "User" row made only for the admin panel — an email to
 * sign in with, a bcrypt password, "hasAccessToAlly" — and a staff_accounts
 * row that marks it, so no count of people mistakes it for a registration.
 * The person's own Netai account is never touched.
 */
const QUERY_TIMEOUT_MS = 5_000;
const PASSWORD_SALT_ROUNDS = 12;

export interface StaffAccountInput {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly createdBy: string;
}

export interface StaffAccount {
  readonly user_id: number;
  readonly name: string;
  readonly email: string;
}

export enum StaffAccountRefusal {
  EmailTaken = 'email_taken',
  PasswordTooShort = 'password_too_short',
}

/** The email as it is stored and compared: trimmed, lower case. */
export function staffEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function emailInUse(email: string): Promise<boolean> {
  const result = await query<{ id: number }>(
    `SELECT id FROM "User" WHERE lower(email) = $1 LIMIT 1`,
    [email],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.length > 0;
}

/**
 * Creates one staff admin account. Refuses an email any account already has —
 * admin login looks an account up by email, so two would make sign-in pick one.
 * The password is never logged and never returned.
 */
export async function createStaffAccount(
  input: StaffAccountInput,
): Promise<StaffAccount | StaffAccountRefusal> {
  if (input.password.length < MIN_ADMIN_PASSWORD_CHARS) return StaffAccountRefusal.PasswordTooShort;
  const email = staffEmail(input.email);
  if (await emailInUse(email)) return StaffAccountRefusal.EmailTaken;
  const hash = await bcrypt.hash(input.password, PASSWORD_SALT_ROUNDS);
  const name = input.name.trim();
  return withTransaction(async (client) => {
    const created = await client.query<{ id: number }>(
      `INSERT INTO "User" (name, email, password, "hasAccessToAlly", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, NOW(), NOW())
       RETURNING id`,
      [name, email, hash],
    );
    const userId = created.rows[0].id;
    await client.query(
      `INSERT INTO staff_accounts (user_id, name, created_by) VALUES ($1, $2, $3)`,
      [userId, name, input.createdBy],
    );
    return { user_id: userId, name, email };
  });
}
