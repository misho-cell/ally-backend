export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface UserPublic {
  id: string;
  email: string;
  createdAt: string;
}

export interface AuthPayload {
  userId: string;
  role: 'user' | 'admin';
}

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: string;
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

export interface InsightField {
  id: string;
  fieldKey: string;
  fieldLabel: string;
  fieldDescription: string;
  isActive: boolean;
  createdAt: string;
}

export interface ContactInsight {
  id: string;
  userId: string;
  neo4jContactId: string;
  neo4jContactName: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ContactInsightWithFieldContext extends ContactInsight {
  fieldContext: InsightField[];
}

export interface ImportContact {
  name: string;
  phones: string[];
  email?: string;
  employer?: string;
  jobPosition?: string;
  city?: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
}

export interface ChatToolParameter {
  type: string;
  required: boolean;
  description: string;
}

export interface ChatToolDefinition<TRequest, TResponse> {
  name: string;
  description: string;
  parameters: Record<string, ChatToolParameter>;
  execute: (params: TRequest) => Promise<TResponse>;
}

export interface DailyCount {
  day: string;
  count: number;
}

export interface GrowthMetrics {
  totalUsers: number;
  newUsersByDay: DailyCount[];
}

export interface RetentionMetrics {
  dau: number;
  wau: number;
  mau: number;
  activeUsersByDay: DailyCount[];
}

export interface FunnelStep {
  step: string;
  users: number;
}

export interface ActivationFunnel {
  steps: FunnelStep[];
}

export interface LabeledCount {
  label: string;
  count: number;
}

export interface CoreUsageMetrics {
  searchesByType: LabeledCount[];
  totalSearches: number;
  // Searches that returned at least one result (NULL-count legacy rows excluded).
  successfulSearches: number;
  introsByStatus: LabeledCount[];
  avgNetworkSize: number;
  factsCount: number;
  insightsCount: number;
}

export interface BlockDiagnostic {
  block: string;
  message: string;
}

// How a registration attempt passed (or would pass) the invite-only gate:
// 'open' — gate disabled; 'existing' — phone already registered;
// 'social' — enough existing users have this phone in their contacts;
// 'referral' — vouched for by a subscribed user's phone number.
export type EligibilityMode = 'open' | 'existing' | 'social' | 'referral';

export type EligibilityReason = 'referral_required' | 'referrer_not_subscribed';

export interface EligibilityCheck {
  eligible: boolean;
  mode?: EligibilityMode;
  reason?: EligibilityReason;
  // Internal: set when mode === 'referral'; recorded as inviterReferralUserId.
  // Not exposed to unauthenticated clients.
  inviterUserId?: number;
}

export interface UserListItem {
  id: number;
  name: string | null;
  phones: string[];
  city: string | null;
  subscriptionStatus: string;
  createdAt: string | null;
  lastActiveAt: string | null;
  contactsCount: number;
}

export interface UserAccount {
  id: number;
  name: string | null;
  email: string | null;
  employer: string | null;
  jobPosition: string | null;
  city: string | null;
  phones: string[];
  createdAt: string | null;
  deletedAt: string | null;
  subscriptionTier: string;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  paddleCustomerId: string | null;
  // Referral: who vouched for this user at registration, and how many
  // registrations this user has vouched for.
  invitedBy: { id: number; name: string | null } | null;
  invitedCount: number;
}

export interface UserNetwork {
  contactsCount: number;
  tagsCount: number;
  blockedCount: number;
  deceasedCount: number;
  firstDegree: number | null;
  secondDegree: number | null;
}

export interface UserActivity {
  threadsCount: number;
  messageCount: number;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
  activityByDay: DailyCount[];
}

export interface RecentSearch {
  query: string;
  tool: string | null;
  flagged: boolean;
  resultCount: number | null;
  createdAt: string;
}

export interface UserSearches {
  totalSearches: number;
  byType: LabeledCount[];
  flaggedCount: number;
  // Searches that returned at least one result. NULL-count rows (logged before
  // result tracking existed) are excluded from this tally.
  successfulSearches: number;
  recent: RecentSearch[];
}

export interface UserOutcomes {
  introRequestsMade: number;
  introRequestsByStatus: LabeledCount[];
  introRequestsMediated: number;
  insightsSaved: number;
  factsSubmitted: number;
}

export interface UserContextEntry {
  key: string;
  value: string;
  updatedAt: string;
}

export interface UserMemory {
  profile: UserContextEntry[];
  privateContext: UserContextEntry[];
  nudgesSent: number;
  notificationFrequencyDays: number | null;
  consecutiveNoOpens: number | null;
  lastNudgeAt: string | null;
  pausedUntil: string | null;
  distressUntil: string | null;
}

export interface UserDevice {
  deviceId: string;
  userAgent: string | null;
  ip: string | null;
  requestCount: number;
  firstSeen: string;
  lastSeen: string;
}

export interface UserDevices {
  devices: UserDevice[];
  pushSubscriptionsCount: number;
}

// Milestone derived from an existing timestamp (no dedicated event table).
// `type` is a stable key the client localizes; events are sorted ascending.
export interface UserTimelineEvent {
  type: 'signup' | 'first_search' | 'first_intro_request' | 'first_nudge' | 'last_active';
  at: string;
}

export interface UserProfile {
  account: UserAccount;
  network: UserNetwork;
  activity: UserActivity;
  searches: UserSearches;
  outcomes: UserOutcomes;
  memory: UserMemory;
  devices: UserDevices;
  costs: UserCosts;
  wallet: UserWallet;
  timeline: UserTimelineEvent[];
  // Populated only when a non-account block failed; the rest still render.
  diagnostics?: BlockDiagnostic[];
}

export interface CostByKind {
  label: string;
  costUsd: number;
}

export interface CostTopSpender {
  userId: string;
  name: string | null;
  costUsd: number;
}

export interface CostMetrics {
  last30dUsd: number;
  byKind: CostByKind[];
  topSpenders: CostTopSpender[];
}

export interface UserCosts {
  last30dUsd: number;
  totalUsd: number;
  byKind: CostByKind[];
}

export interface UserWallet {
  balance: number;
  grantedThisMonth: number;
  spentThisMonth: number;
}

export interface AnalyticsOverview {
  growth: GrowthMetrics;
  retention: RetentionMetrics;
  funnel: ActivationFunnel;
  usage: CoreUsageMetrics;
  costs: CostMetrics;
  // Populated only when one or more blocks failed; lets the dashboard render
  // the blocks that succeeded instead of failing the whole request.
  diagnostics?: BlockDiagnostic[];
}
