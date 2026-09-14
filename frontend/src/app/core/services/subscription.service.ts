import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, from, throwError } from 'rxjs';
import { map, switchMap, tap, catchError } from 'rxjs/operators';
import { SubscriptionStatus, SubscriptionInfo } from '../models/user.model';
import { AuthService } from './auth.service';
import { BillingService } from './billing.service';
import { StorageService } from './storage.service';
import { environment } from '../../../environments/environment';

const SUBSCRIPTION_CACHE_KEY = 'jobswipe_subscription_cache';

const EMPTY_SUBSCRIPTION: SubscriptionInfo = {
  status: SubscriptionStatus.None,
  trialStartDate: null,
  trialEndDate: null,
  expiresAt: null,
  productId: null
};

/**
 * Subscription state. The backend is the entitlement authority whenever the
 * user is signed in; the last known entitlement is cached locally only so the
 * paywall keeps working offline. A cached entitlement never upgrades access -
 * expiry is always re-evaluated locally against real timestamps.
 */
@Injectable({
  providedIn: 'root'
})
export class SubscriptionService {
  private subscriptionSubject = new BehaviorSubject<SubscriptionInfo>(
    this.loadCachedSubscription()
  );

  subscription$: Observable<SubscriptionInfo> = this.subscriptionSubject.asObservable();
  status$: Observable<SubscriptionStatus> = this.subscription$.pipe(
    map(sub => sub.status)
  );
  canApply$: Observable<boolean> = this.status$.pipe(
    map(status => status === SubscriptionStatus.Trial || status === SubscriptionStatus.Active)
  );

  get currentStatus(): SubscriptionStatus {
    return this.effectiveStatus(this.subscriptionSubject.value);
  }

  get canApply(): boolean {
    const status = this.currentStatus;
    return status === SubscriptionStatus.Trial || status === SubscriptionStatus.Active;
  }

  get subscription(): SubscriptionInfo {
    return this.subscriptionSubject.value;
  }

  constructor(
    private authService: AuthService,
    private billingService: BillingService,
    private storage: StorageService
  ) {
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.refreshStatus();
      } else {
        this.subscriptionSubject.next({ ...EMPTY_SUBSCRIPTION });
      }
    });
  }

  /**
   * Trial state is created server-side on signup; "starting" a trial locally
   * just means pulling the fresh entitlement from the backend.
   */
  startTrial(): void {
    this.refreshStatus();
  }

  /** Pull the authoritative entitlement from the backend. */
  refreshStatus(): void {
    if (!this.authService.isLoggedIn) {
      this.subscriptionSubject.next({ ...EMPTY_SUBSCRIPTION });
      return;
    }
    this.billingService.getEntitlement().pipe(
      catchError(() => {
        // Offline or server trouble: keep the cached state, re-evaluated
        // locally, never upgraded.
        return [null];
      })
    ).subscribe(info => {
      if (info) {
        const normalised = this.normalise(info);
        this.saveCachedSubscription(normalised);
        this.subscriptionSubject.next(normalised);
      } else {
        this.subscriptionSubject.next(
          this.withEffectiveStatus(this.subscriptionSubject.value)
        );
      }
    });
  }

  /**
   * Purchase a subscription through the configured store provider and have
   * the backend verify the receipt. Fails safely (BillingNotConfiguredError
   * or a server error) rather than faking success when billing is not set up.
   */
  purchaseSubscription(productId: string): Observable<SubscriptionInfo> {
    if (!this.authService.isLoggedIn) {
      return throwError(() => new Error('Please sign in to subscribe'));
    }
    return from(this.billingService.purchase(productId)).pipe(
      switchMap(purchase => this.billingService.verifyReceipt(purchase)),
      map(info => this.normalise(info)),
      tap(info => {
        this.saveCachedSubscription(info);
        this.subscriptionSubject.next(info);
      })
    );
  }

  /**
   * Restore purchases: reconcile the store with the backend, then refresh
   * entitlement from the server.
   */
  restorePurchases(): Observable<SubscriptionInfo> {
    return from(this.billingService.restore()).pipe(
      switchMap(purchases => {
        if (purchases.length === 0) {
          return throwError(() => new Error('No previous purchases found'));
        }
        return this.billingService.verifyReceipt(purchases[0]);
      }),
      map(info => this.normalise(info)),
      tap(info => {
        this.saveCachedSubscription(info);
        this.subscriptionSubject.next(info);
      })
    );
  }

  getTrialDaysRemaining(): number {
    const sub = this.subscriptionSubject.value;
    if (sub.status !== SubscriptionStatus.Trial || !sub.trialEndDate) return 0;
    const remaining = new Date(sub.trialEndDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
  }

  getStatusLabel(): string {
    switch (this.currentStatus) {
      case SubscriptionStatus.Trial:
        return `Free Trial (${this.getTrialDaysRemaining()} days left)`;
      case SubscriptionStatus.Active:
        return 'Premium Active';
      case SubscriptionStatus.Expired:
        return 'Subscription Expired';
      default:
        return 'No Subscription';
    }
  }

  /** True when store billing is configured (determines which errors are shown). */
  get billingConfigured(): boolean {
    return environment.billing.provider !== 'none';
  }

  private normalise(info: SubscriptionInfo): SubscriptionInfo {
    return this.withEffectiveStatus({
      status: (info.status as SubscriptionStatus) || SubscriptionStatus.None,
      trialStartDate: info.trialStartDate ?? null,
      trialEndDate: info.trialEndDate ?? null,
      expiresAt: info.expiresAt ?? null,
      productId: info.productId ?? null
    });
  }

  private withEffectiveStatus(info: SubscriptionInfo): SubscriptionInfo {
    return { ...info, status: this.effectiveStatus(info) };
  }

  private effectiveStatus(info: SubscriptionInfo): SubscriptionStatus {
    const now = Date.now();
    if (info.status === SubscriptionStatus.Trial && info.trialEndDate) {
      if (new Date(info.trialEndDate).getTime() < now) {
        return SubscriptionStatus.Expired;
      }
    }
    if (info.status === SubscriptionStatus.Active && info.expiresAt) {
      if (new Date(info.expiresAt).getTime() < now) {
        return SubscriptionStatus.Expired;
      }
    }
    return info.status;
  }

  private loadCachedSubscription(): SubscriptionInfo {
    try {
      const data = this.storage.get(SUBSCRIPTION_CACHE_KEY);
      if (data) {
        return this.withEffectiveStatus(JSON.parse(data));
      }
    } catch {
      // ignore corrupt state
    }
    return { ...EMPTY_SUBSCRIPTION };
  }

  private saveCachedSubscription(info: SubscriptionInfo): void {
    this.storage.set(SUBSCRIPTION_CACHE_KEY, JSON.stringify(info));
  }
}
