import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map, delay, tap } from 'rxjs/operators';
import { SubscriptionStatus, SubscriptionInfo } from '../models/user.model';
import { AuthService } from './auth.service';

const SUBSCRIPTION_KEY = 'jobswipe_subscription';
const TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000;

@Injectable({
  providedIn: 'root'
})
export class SubscriptionService {
  private subscriptionSubject = new BehaviorSubject<SubscriptionInfo>(this.loadSubscription());

  subscription$: Observable<SubscriptionInfo> = this.subscriptionSubject.asObservable();
  status$: Observable<SubscriptionStatus> = this.subscription$.pipe(
    map(sub => sub.status)
  );
  canApply$: Observable<boolean> = this.status$.pipe(
    map(status => status === SubscriptionStatus.Trial || status === SubscriptionStatus.Active)
  );

  get currentStatus(): SubscriptionStatus {
    return this.subscriptionSubject.value.status;
  }

  get canApply(): boolean {
    return this.currentStatus === SubscriptionStatus.Trial || this.currentStatus === SubscriptionStatus.Active;
  }

  get subscription(): SubscriptionInfo {
    return this.subscriptionSubject.value;
  }

  constructor(private authService: AuthService) {
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.refreshStatus();
      } else {
        this.subscriptionSubject.next({
          status: SubscriptionStatus.None,
          trialStartDate: null,
          trialEndDate: null,
          expiresAt: null,
          productId: null
        });
      }
    });
  }

  startTrial(): void {
    const now = new Date();
    const trialEnd = new Date(now.getTime() + TRIAL_DURATION_MS);

    const info: SubscriptionInfo = {
      status: SubscriptionStatus.Trial,
      trialStartDate: now.toISOString(),
      trialEndDate: trialEnd.toISOString(),
      expiresAt: null,
      productId: null
    };

    this.saveSubscription(info);
    this.subscriptionSubject.next(info);
  }

  refreshStatus(): void {
    const current = this.loadSubscription();

    if (current.status === SubscriptionStatus.Trial && current.trialEndDate) {
      if (new Date(current.trialEndDate) < new Date()) {
        const expired: SubscriptionInfo = {
          ...current,
          status: SubscriptionStatus.Expired
        };
        this.saveSubscription(expired);
        this.subscriptionSubject.next(expired);
        return;
      }
    }

    if (current.status === SubscriptionStatus.Active && current.expiresAt) {
      if (new Date(current.expiresAt) < new Date()) {
        const expired: SubscriptionInfo = {
          ...current,
          status: SubscriptionStatus.Expired
        };
        this.saveSubscription(expired);
        this.subscriptionSubject.next(expired);
        return;
      }
    }

    this.subscriptionSubject.next(current);
  }

  purchaseSubscription(productId: string): Observable<SubscriptionInfo> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const info: SubscriptionInfo = {
      status: SubscriptionStatus.Active,
      trialStartDate: this.subscriptionSubject.value.trialStartDate,
      trialEndDate: this.subscriptionSubject.value.trialEndDate,
      expiresAt: expiresAt.toISOString(),
      productId
    };

    return of(info).pipe(
      delay(1500),
      tap(sub => {
        this.saveSubscription(sub);
        this.subscriptionSubject.next(sub);
      })
    );
  }

  restorePurchases(): Observable<SubscriptionInfo> {
    return of(this.subscriptionSubject.value).pipe(delay(1000));
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

  private loadSubscription(): SubscriptionInfo {
    try {
      const data = localStorage.getItem(SUBSCRIPTION_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch {
      // ignore
    }
    return {
      status: SubscriptionStatus.None,
      trialStartDate: null,
      trialEndDate: null,
      expiresAt: null,
      productId: null
    };
  }

  private saveSubscription(info: SubscriptionInfo): void {
    localStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(info));
  }
}
