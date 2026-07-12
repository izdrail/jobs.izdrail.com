export interface User {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export interface AuthToken {
  token: string;
  expiresAt: string;
}

export interface SwipeEvent {
  userId: string | null;
  jobId: string;
  direction: 'left' | 'right';
  timestamp: string;
}

export enum SubscriptionStatus {
  Trial = 'trial',
  Active = 'active',
  Expired = 'expired',
  None = 'none'
}

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  trialStartDate: string | null;
  trialEndDate: string | null;
  expiresAt: string | null;
  productId: string | null;
}
