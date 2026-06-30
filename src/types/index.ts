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
  introsByStatus: LabeledCount[];
  avgNetworkSize: number;
  factsCount: number;
  insightsCount: number;
}

export interface AnalyticsBlockError {
  block: string;
  message: string;
}

export interface AnalyticsOverview {
  growth: GrowthMetrics;
  retention: RetentionMetrics;
  funnel: ActivationFunnel;
  usage: CoreUsageMetrics;
  // Populated only when one or more blocks failed; lets the dashboard render
  // the blocks that succeeded instead of failing the whole request.
  diagnostics?: AnalyticsBlockError[];
}
