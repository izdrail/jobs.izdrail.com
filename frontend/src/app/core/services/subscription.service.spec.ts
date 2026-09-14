import { BehaviorSubject, of, throwError } from 'rxjs';
import { SubscriptionService } from './subscription.service';
import { AuthService } from './auth.service';
import { BillingService, BillingNotConfiguredError } from './billing.service';
import { StorageService } from './storage.service';
import { User } from '../models/user.model';

const USER: User = { id: 'u1', email: 'a@b.co', name: null, createdAt: '' };

function futureIso(days: number): string {
  return new Date(Date.now() + days * 86400_000).toISOString();
}

function pastIso(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString();
}

describe('SubscriptionService', () => {
  let userSubject: BehaviorSubject<User | null>;
  let authService: any;
  let billingService: jasmine.SpyObj<BillingService>;
  let storage: StorageService;

  function createService(): SubscriptionService {
    return new SubscriptionService(authService, billingService, storage);
  }

  beforeEach(() => {
    localStorage.clear();
    storage = new StorageService();
    userSubject = new BehaviorSubject<User | null>(null);
    authService = {
      currentUser$: userSubject.asObservable(),
      get isLoggedIn() { return userSubject.value !== null; }
    };
    billingService = jasmine.createSpyObj('BillingService', ['getEntitlement', 'purchase', 'restore', 'verifyReceipt']);
  });

  it('is None while logged out', () => {
    const service = createService();
    expect(service.canApply).toBeFalse();
  });

  it('maps a backend trial entitlement to canApply=true', () => {
    const service = createService();
    billingService.getEntitlement.and.returnValue(of({
      status: 'trial' as any,
      trialStartDate: pastIso(1),
      trialEndDate: futureIso(2),
      expiresAt: null,
      productId: null
    }));
    userSubject.next(USER);
    expect(service.currentStatus).toBe('trial' as any);
    expect(service.canApply).toBeTrue();
    expect(service.getTrialDaysRemaining()).toBeGreaterThanOrEqual(1);
  });

  it('maps an active paid entitlement to canApply=true', () => {
    const service = createService();
    billingService.getEntitlement.and.returnValue(of({
      status: 'active' as any,
      trialStartDate: null,
      trialEndDate: null,
      expiresAt: futureIso(20),
      productId: 'jobswipe_monthly'
    }));
    userSubject.next(USER);
    expect(service.canApply).toBeTrue();
  });

  it('never upgrades access from a cached expired entitlement', async () => {
    // Logged-in user, offline, cached trial that has since expired.
    localStorage.setItem('jobswipe_subscription_cache', JSON.stringify({
      status: 'trial',
      trialStartDate: pastIso(10),
      trialEndDate: pastIso(7),
      expiresAt: null,
      productId: null
    }));
    await storage.init();
    billingService.getEntitlement.and.returnValue(
      throwError(() => new Error('offline'))
    );
    // AuthService restores the session before SubscriptionService subscribes
    // in the real app; start logged in to match that ordering.
    userSubject.next(USER);
    const service = createService();
    // Cache loaded, but expiry is re-evaluated locally.
    expect(service.currentStatus).toBe('expired' as any);
    expect(service.canApply).toBeFalse();
  });

  it('re-evaluates expiry from real timestamps on refresh failure', () => {
    const service = createService();
    billingService.getEntitlement.and.returnValue(
      throwError(() => new Error('offline'))
    );
    userSubject.next(USER);
    expect(service.canApply).toBeFalse();
  });

  it('purchase fails safely instead of faking success when billing is unconfigured', async () => {
    billingService.purchase.and.rejectWith(new BillingNotConfiguredError());
    const service = createService();
    billingService.getEntitlement.and.returnValue(of({
      status: 'trial' as any,
      trialStartDate: pastIso(1),
      trialEndDate: futureIso(2),
      expiresAt: null,
      productId: null
    }));
    userSubject.next(USER);

    let error: any;
    service.purchaseSubscription('jobswipe_monthly').subscribe({ error: e => (error = e) });
    await Promise.resolve();
    await Promise.resolve();

    expect(error instanceof BillingNotConfiguredError).toBeTrue();
    // Status must not have been upgraded by the failed purchase.
    expect(service.currentStatus).toBe('trial' as any);
    expect(billingService.verifyReceipt).not.toHaveBeenCalled();
  });

  it('requires sign-in before purchasing', () => {
    const service = createService();
    let error: any;
    service.purchaseSubscription('jobswipe_monthly').subscribe({ error: e => (error = e) });
    expect(error?.message).toContain('sign in');
    expect(billingService.purchase).not.toHaveBeenCalled();
  });

  it('verifies the receipt with the backend after a store purchase', async () => {
    billingService.purchase.and.resolveTo({
      platform: 'android',
      productId: 'jobswipe_monthly',
      receipt: 'receipt-data'
    });
    billingService.verifyReceipt.and.returnValue(of({
      status: 'active' as any,
      trialStartDate: null,
      trialEndDate: null,
      expiresAt: futureIso(30),
      productId: 'jobswipe_monthly'
    }));
    const service = createService();
    billingService.getEntitlement.and.returnValue(of({
      status: 'trial' as any,
      trialStartDate: pastIso(1),
      trialEndDate: futureIso(2),
      expiresAt: null,
      productId: null
    }));
    userSubject.next(USER);

    let result: any;
    service.purchaseSubscription('jobswipe_monthly').subscribe(r => (result = r));
    await Promise.resolve();
    await Promise.resolve();

    expect(billingService.verifyReceipt).toHaveBeenCalledWith({
      platform: 'android',
      productId: 'jobswipe_monthly',
      receipt: 'receipt-data'
    });
    expect(result.status).toBe('active');
    expect(service.canApply).toBeTrue();
  });
});
