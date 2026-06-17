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
