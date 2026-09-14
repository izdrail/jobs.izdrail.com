import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SubscriptionInfo } from '../models/user.model';

/**
 * Error raised when a purchase is attempted before a store provider and
 * server-side receipt verification have been configured. The message is
 * intentionally actionable so it can be surfaced to whoever deploys the app.
 */
export class BillingNotConfiguredError extends Error {
  readonly code = 'BILLING_NOT_CONFIGURED';
  constructor() {
    super(
      'In-app purchases are not configured yet. A store provider ' +
      '(environment.billing.provider) and server receipt verification ' +
      '(JOBSWIPE_IAPTIC_VALIDATOR_URL / JOBSWIPE_IAPTIC_API_KEY) are required. ' +
      'See README "Payments & billing".'
    );
    this.name = 'BillingNotConfiguredError';
  }
}

export interface PurchaseResult {
  platform: 'android' | 'ios' | 'web';
  productId: string;
  receipt: string;
}

/**
 * Store integration boundary. The backend remains the entitlement authority:
 * a client-side purchase callback never grants access on its own - receipts
 * go to POST /billing/verify and entitlement state comes from the server.
 *
 * No provider SDK ships until merchant credentials exist; until then the
 * purchase path fails safely with BillingNotConfiguredError instead of a
 * fake success.
 */
@Injectable({
  providedIn: 'root'
})
export class BillingService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  get isConfigured(): boolean {
    return environment.billing.provider !== 'none';
  }

  /**
   * Run the native store purchase flow for a product.
   * Throws BillingNotConfiguredError when no provider is configured.
   */
  async purchase(productId: string): Promise<PurchaseResult> {
    if (!this.isConfigured) {
      throw new BillingNotConfiguredError();
    }
    // A real provider (e.g. @revenuecat/purchases-capacitor or iaptic) is
    // wired in here once merchant credentials exist; see README.
    throw new BillingNotConfiguredError();
  }

  /** Restore previously completed purchases from the store. */
  async restore(): Promise<PurchaseResult[]> {
    if (!this.isConfigured) {
      throw new BillingNotConfiguredError();
    }
    throw new BillingNotConfiguredError();
  }

  /** Ask the backend to validate a store receipt and activate entitlement. */
  verifyReceipt(purchase: PurchaseResult): Observable<SubscriptionInfo> {
    return this.http.post<SubscriptionInfo>(`${this.apiUrl}/billing/verify`, {
      platform: purchase.platform,
      product_id: purchase.productId,
      receipt: purchase.receipt
    });
  }

  /** Fetch the server-authoritative entitlement state. */
  getEntitlement(): Observable<SubscriptionInfo> {
    return this.http.get<SubscriptionInfo>(`${this.apiUrl}/billing/entitlement`);
  }
}
