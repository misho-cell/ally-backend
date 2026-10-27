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

/**
 * 4590 (the frontend, 14 Oct 13:00Z) dropped the freshness step and the count
 * followed it to four. #1882 / #2047 (the tester's 64846, founder's plan of
 * five): the frontend draws freshness again (their 17 Oct 15:05Z), so all
 * five count, and „N / 5" can reach five.
 */
export const COUNTED_SETUP_STEPS: readonly SetupStep[] = SETUP_STEPS;
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
  /**
   * 4598: when this person first used Netai (their first conversation), so the
   * app can stop showing the setup banner a week later. Null before any.
   */
  readonly started_at: string | null;
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
interface ServerSeen {
  readonly ticks: ServerTicks;
  readonly startedAt: string | null;
}

async function serverSeen(userId: number): Promise<ServerSeen> {
  const [row, connector] = await Promise.all([
    query<{
      contacts: boolean;
      freshness: boolean;
      notifications: boolean;
      started_at: string | null;
    }>(
      `SELECT EXISTS (SELECT 1 FROM import_attempts
                       WHERE user_id = $1 AND imported > 0 AND NOT in_progress) AS contacts,
              COALESCE((SELECT contact_import_reminder FROM "User" WHERE id = $1), FALSE) AS freshness,
              EXISTS (SELECT 1 FROM push_subscriptions WHERE user_id = $1) AS notifications,
              (SELECT MIN(created_at) FROM threads WHERE user_id = $1) AS started_at`,
      [userId],
      QUERY_TIMEOUT_MS,
    ),
    connectorState(userId),
  ]);
  const r = row.rows[0];
  return {
    ticks: {
      [SetupStep.Install]: false,
      [SetupStep.Notifications]: r?.notifications === true,
      [SetupStep.Contacts]: r?.contacts === true,
      [SetupStep.Freshness]: r?.freshness === true,
      [SetupStep.Connector]: connector.connected,
    },
    startedAt: r?.started_at ?? null,
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

/** A counted step is done when the server sees it, or when any gadget said Done. */
export function doneCount(server: ServerTicks, devices: readonly DeviceSetup[]): number {
  return COUNTED_SETUP_STEPS.filter(
    (step) => server[step] || devices.some((d) => d.steps[step] === StepStatus.Done),
  ).length;
}

export async function setupState(userId: number): Promise<SetupState> {
  const [seen, devices] = await Promise.all([serverSeen(userId), devicesOf(userId)]);
  return {
    done_count: doneCount(seen.ticks, devices),
    total: COUNTED_SETUP_STEPS.length,
    started_at: seen.startedAt,
    server: seen.ticks,
    devices,
  };
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

const MAX_LISTED_PEOPLE = 200;

export interface PersonMissingSteps {
  readonly user_id: number;
  readonly name: string | null;
  readonly joined_at: string;
  readonly done_count: number;
  /** Counted steps neither the server saw nor any gadget marked done, with what the gadgets said. */
  readonly missing: readonly { readonly step: SetupStep; readonly said: StepStatus | null }[];
}

export interface SetupMissingReport {
  readonly people: readonly PersonMissingSteps[];
  /** Per counted step, how many of these people have it done. */
  readonly done_by_step: Readonly<Record<SetupStep, number>>;
  readonly total_people: number;
}

/** What the gadgets said about one step, the latest first; null when none said anything. */
function saidAbout(devices: readonly DeviceSetup[], step: SetupStep): StepStatus | null {
  return devices.find((d) => d.steps[step] !== undefined)?.steps[step] ?? null;
}

function missingOf(state: SetupState): PersonMissingSteps['missing'] {
  return COUNTED_SETUP_STEPS.filter(
    (step) => !state.server[step] && !state.devices.some((d) => d.steps[step] === StepStatus.Done),
  ).map((step) => ({ step, said: saidAbout(state.devices, step) }));
}

/**
 * #7757 / #7828 (Misho's „კი", 27 Oct): the steps a person still lacks, most
 * important first, for the app's missing-step card. „install" is the home
 * screen; the app reports it per device (PUT /setup/devices/:id/steps/install).
 */
export const MISSING_STEP_ORDER: readonly SetupStep[] = [
  SetupStep.Contacts,
  SetupStep.Notifications,
  SetupStep.Install,
  SetupStep.Freshness,
  SetupStep.Connector,
];

export async function missingSteps(userId: number): Promise<SetupStep[]> {
  const missing = new Set(missingOf(await setupState(userId)).map((m) => m.step));
  return MISSING_STEP_ORDER.filter((step) => missing.has(step));
}

/**
 * #7723 / #7730 (tester's engagement desk C-0020, 25 Oct): who joined since a
 * day, and which setup steps each still lacks — fictional seats left out — with
 * how many have each step done (the share with contacts is the daily report's).
 */
export async function setupMissingSince(since: string): Promise<SetupMissingReport> {
  const people = await query<{ id: number; name: string | null; joined_at: string }>(
    `SELECT u.id, NULLIF(TRIM(u.name), '') AS name, u."createdAt" AS joined_at
       FROM "User" u
      WHERE u."createdAt" >= $1::date AND u."deletedAt" IS NULL
        AND NOT EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id = u.id)
      ORDER BY u."createdAt"
      LIMIT $2`,
    [since, MAX_LISTED_PEOPLE],
    QUERY_TIMEOUT_MS,
  );
  const rows: PersonMissingSteps[] = [];
  const doneBy = Object.fromEntries(COUNTED_SETUP_STEPS.map((s) => [s, 0])) as Record<
    SetupStep,
    number
  >;
  for (const p of people.rows) {
    const state = await setupState(p.id);
    const missing = missingOf(state);
    for (const step of COUNTED_SETUP_STEPS)
      if (!missing.some((m) => m.step === step)) doneBy[step] += 1;
    rows.push({
      user_id: p.id,
      name: p.name,
      joined_at: p.joined_at,
      done_count: state.done_count,
      missing,
    });
  }
  return { people: rows, done_by_step: doneBy, total_people: rows.length };
}
