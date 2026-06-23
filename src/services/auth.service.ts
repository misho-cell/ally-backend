import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { query } from '../db/postgres/client';
import { sendWhatsAppMessage } from './whatsapp.service';
import { createUserPhoneNode } from './contacts.service';
import { AuthPayload } from '../types';

const jwtSecret = process.env.JWT_SECRET ?? '';
if (!jwtSecret) {
  throw new Error('JWT_SECRET must be set in environment variables');
}

const SALT_ROUNDS = 12;

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function parsePhone(e164: string): { phoneCode: string; phoneNumber: string } {
  if (!e164.startsWith('+')) {
    throw new Error('ტელეფონი E.164 ფორმატში უნდა იყოს (+...)');
  }
  if (e164.startsWith('+995')) return { phoneCode: '+995', phoneNumber: e164.slice(4) };
  if (e164.startsWith('+1') && e164.length === 12)
    return { phoneCode: '+1', phoneNumber: e164.slice(2) };
  if (e164.startsWith('+7')) return { phoneCode: '+7', phoneNumber: e164.slice(2) };
  if (e164.startsWith('+44')) return { phoneCode: '+44', phoneNumber: e164.slice(3) };
  if (e164.startsWith('+49')) return { phoneCode: '+49', phoneNumber: e164.slice(3) };
  // Generic: assume 3-digit country code
  return { phoneCode: e164.slice(0, 4), phoneNumber: e164.slice(4) };
}

export async function requestOTP(
  phone: string,
  actionType: 'REGISTER' | 'AUTH' | 'RECOVER',
): Promise<void> {
  const code = generateOTP();

  await query(
    `INSERT INTO "Otp" (identifier, "identifierType", "actionType", otp, "createdAt", "updatedAt")
     VALUES ($1, 'PHONE'::"IdentifierType", $2::"ActionType", $3, NOW(), NOW())`,
    [phone, actionType, code],
  );

  await sendWhatsAppMessage(phone, code);
}

export async function verifyOTP(
  phone: string,
  code: string,
  actionType: 'REGISTER' | 'AUTH' | 'RECOVER',
): Promise<void> {
  const result = await query<{ id: number }>(
    `SELECT id FROM "Otp"
     WHERE identifier = $1
       AND otp = $2
       AND "actionType" = $3::"ActionType"
       AND "identifierType" = 'PHONE'::"IdentifierType"
       AND "createdAt" > NOW() - INTERVAL '5 minutes'`,
    [phone, code, actionType],
  );

  if (!result.rowCount || result.rowCount === 0) {
    throw new Error('კოდი არასწორია ან ვადა გასულია');
  }

  await query('DELETE FROM "Otp" WHERE id = $1', [result.rows[0].id]);
}

export async function registerUser(phone: string, name: string): Promise<{ token: string }> {
  const existing = await query<{ id: number }>('SELECT id FROM "UserPhone" WHERE phone = $1', [
    phone,
  ]);

  if (existing.rowCount && existing.rowCount > 0) {
    throw new Error('ნომერი უკვე რეგისტრირებულია');
  }

  const password = await bcrypt.hash(randomUUID(), SALT_ROUNDS);

  const userResult = await query<{ id: number }>(
    `INSERT INTO "User" (name, password, "createdAt", "updatedAt")
     VALUES ($1, $2, NOW(), NOW())
     RETURNING id`,
    [name, password],
  );

  const userId = userResult.rows[0].id;
  const { phoneCode, phoneNumber } = parsePhone(phone);

  await query(
    `INSERT INTO "UserPhone" (phone, "phoneCode", "phoneNumber", "userId", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, NOW(), NOW())`,
    [phone, phoneCode, phoneNumber, userId],
  );

  await createUserPhoneNode(phone);

  const token = jwt.sign({ userId: String(userId), role: 'user' }, jwtSecret, { expiresIn: '30d' });
  return { token };
}

export async function completeLogin(phone: string): Promise<{ token: string; isNewUser: boolean }> {
  const result = await query<{ id: number }>(
    'SELECT "userId" AS id FROM "UserPhone" WHERE phone = $1',
    [phone],
  );

  if (!result.rowCount || result.rowCount === 0) {
    return { token: '', isNewUser: true };
  }

  const userId = result.rows[0].id;
  const token = jwt.sign({ userId: String(userId), role: 'user' }, jwtSecret, { expiresIn: '30d' });
  return { token, isNewUser: false };
}

export async function adminLogin(email: string, password: string): Promise<{ token: string }> {
  const result = await query<{ id: number; password: string }>(
    'SELECT id, password FROM "User" WHERE email = $1 AND "deletedAt" IS NULL',
    [email],
  );

  if (!result.rowCount || result.rowCount === 0) {
    throw new Error('მომხმარებელი ვერ მოიძებნა');
  }

  const user = result.rows[0];

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Error('არასწორი პაროლი');
  }

  const token = jwt.sign({ userId: String(user.id), role: 'admin' }, jwtSecret, {
    expiresIn: '8h',
  });
  return { token };
}

export function verifyToken(token: string): AuthPayload {
  const decoded = jwt.verify(token, jwtSecret);

  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    !('userId' in decoded) ||
    !('role' in decoded)
  ) {
    throw new Error('Invalid authentication token');
  }

  return {
    userId: String((decoded as Record<string, unknown>).userId),
    role: (decoded as Record<string, unknown>).role as 'user' | 'admin',
  };
}
