import { query } from '../db/postgres/client';
import { connectorState } from './connectorState.service';

/**
 * 1882 (founder, 6 Oct; the frontend's 06:30Z item 10): the setup list —
 * install, notifications, contacts, freshness, connector — per person and per
 * gadget. The person marks a step on a gadget; the server ticks what it can
 * see for itself, so a step done is shown done even when nobody tapped Done.
 */
const QUERY_TIMEOUT_MS = 5_000;
const MAX_DEVICES = 20;

export enum SetupStep {
  Install = 'install',
  Notifications = 'notifications',
  Contacts = 'contacts',
  Freshness = 'freshness',
  Connector = 'connector',
}

export enum StepStatus {
  Done = 'done',
  Failed = 'failed',
  Later = 'later',
}

export enum Gadget {
  Iphone = 'iphone',
  Android = 'android',
  Windows = 'windows',
  Mac = 'mac',
  Other = 'other',
}

export const SETUP_STEPS: readonly SetupStep[] = Object.values(SetupStep);
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isSetupStep(v: unknown): v is SetupStep {
  return typeof v === 'string' && (SETUP_STEPS as readonly string[]).includes(v);
}
export function isStepStatus(v: unknown): v is StepStatus {
  return typeof v === 'string' && (Object.values(StepStatus) as string[]).includes(v);
}
export function isGadget(v: unknown): v is Gadget {
  return typeof v === 'string' && (Object.values(Gadget) as string[]).includes(v);
}
export function isDeviceId(v: unknown): v is string {
  return typeof v === 'string' && DEVICE_ID_RE.test(v);
}

export type ServerTicks = Readonly<Record<SetupStep, boolean>>;

export interface DeviceSetup {
  readonly device_id: string;
  readonly gadget: Gadget;
  readonly steps: Partial<Record<SetupStep, StepStatus>>;
  readonly updated_at: string;
}

export interface SetupState {
  readonly done_count: number;
  readonly total: number;
  readonly server: ServerTicks;
  readonly devices: readonly DeviceSetup[];
}

export async function recordStep(
  userId: number,
  deviceId: string,
  gadget: Gadget,
  step: SetupStep,
  status: StepStatus,
): Promise<void> {
  await query(
    `INSERT INTO setup_steps (user_id, device_id, gadget, step, status)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, device_id, step)
     DO UPDATE SET gadget = EXCLUDED.gadget, status = EXCLUDED.status, updated_at = NOW()`,
    [userId, deviceId, gadget, step, status],
    QUERY_TIMEOUT_MS,
  );
}

/** What the server can see for itself; install is the gadget's own to say. */
async function serverTicks(userId: number): Promise<ServerTicks> {
  const [row, connector] = await Promise.all([
    query<{ contacts: boolean; freshness: boolean; notifications: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM import_attempts
                       WHERE user_id = $1 AND imported > 0 AND NOT in_progress) AS contacts,
              COALESCE((SELECT contact_import_reminder FROM "User" WHERE id = $1), FALSE) AS freshness,
              EXISTS (SELECT 1 FROM push_subscriptions WHERE user_id = $1) AS notifications`,
      [userId],
      QUERY_TIMEOUT_MS,
    ),
    connectorState(userId),
  ]);
  const r = row.rows[0];
  return {
    [SetupStep.Install]: false,
    [SetupStep.Notifications]: r?.notifications === true,
    [SetupStep.Contacts]: r?.contacts === true,
    [SetupStep.Freshness]: r?.freshness === true,
    [SetupStep.Connector]: connector.connected,
  };
}

async function devicesOf(userId: number): Promise<DeviceSetup[]> {
  const result = await query<{
    device_id: string;
    gadget: Gadget;
    step: SetupStep;
    status: StepStatus;
    updated_at: string;
  }>(
    `SELECT device_id, gadget, step, status, updated_at FROM setup_steps
      WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2`,
    [userId, MAX_DEVICES * SETUP_STEPS.length],
    QUERY_TIMEOUT_MS,
  );
  const byDevice = new Map<string, DeviceSetup>();
  for (const r of result.rows) {
    const device = byDevice.get(r.device_id) ?? {
      device_id: r.device_id,
      gadget: r.gadget,
      steps: {},
      updated_at: r.updated_at,
    };
    byDevice.set(r.device_id, { ...device, steps: { ...device.steps, [r.step]: r.status } });
  }
  return [...byDevice.values()].slice(0, MAX_DEVICES);
}

/** A step is done when the server sees it, or when any gadget said Done. */
export function doneCount(server: ServerTicks, devices: readonly DeviceSetup[]): number {
  return SETUP_STEPS.filter(
    (step) => server[step] || devices.some((d) => d.steps[step] === StepStatus.Done),
  ).length;
}

export async function setupState(userId: number): Promise<SetupState> {
  const [server, devices] = await Promise.all([serverTicks(userId), devicesOf(userId)]);
  return { done_count: doneCount(server, devices), total: SETUP_STEPS.length, server, devices };
}

export interface FunnelRow {
  readonly gadget: Gadget;
  readonly step: SetupStep;
  readonly done: number;
  readonly failed: number;
  readonly later: number;
}

/** 1882 part 9: the admin funnel — per gadget and step, how many people said what. */
export async function setupFunnel(): Promise<FunnelRow[]> {
  const result = await query<FunnelRow>(
    `SELECT gadget, step,
            COUNT(DISTINCT user_id) FILTER (WHERE status = 'done')::int AS done,
            COUNT(DISTINCT user_id) FILTER (WHERE status = 'failed')::int AS failed,
            COUNT(DISTINCT user_id) FILTER (WHERE status = 'later')::int AS later
       FROM setup_steps
      GROUP BY gadget, step
      ORDER BY gadget, step
      LIMIT $1`,
    [Object.values(Gadget).length * SETUP_STEPS.length],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}
