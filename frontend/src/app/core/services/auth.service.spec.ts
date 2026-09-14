import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { StorageService } from './storage.service';
import { environment } from '../../../environments/environment';
import { AuthToken, User } from '../models/user.model';

const USER: User = { id: 'user_1', email: 'a@b.co', name: 'A', createdAt: new Date().toISOString() };

function futureToken(): AuthToken {
  return {
    token: 'tok-' + Math.random().toString(36).slice(2),
    expiresAt: new Date(Date.now() + 3600_000).toISOString()
  };
}

describe('AuthService', () => {
  let http: HttpTestingController;
  let storage: StorageService;

  async function createService(): Promise<AuthService> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [AuthService, StorageService, provideHttpClient(), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpTestingController);
    storage = TestBed.inject(StorageService);
    // APP_INITIALIZER hydrates storage in the real app; do it explicitly here.
    await storage.init();
    return TestBed.inject(AuthService);
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('login persists the session through the storage abstraction', async () => {
    const service = await createService();
    const token = futureToken();
    service.login('a@b.co', 'pw').subscribe();

    const req = http.expectOne(`${environment.apiUrl}/auth/login`);
    req.flush({ user: USER, token });

    expect(service.isLoggedIn).toBeTrue();
    expect(service.token).toBe(token.token);
    expect(storage.get('jobswipe_auth_token')).toContain(token.token);
  });

  it('restores a persisted session on construction', async () => {
    const first = await createService();
    const token = futureToken();
    first.login('a@b.co', 'pw').subscribe();
    http.expectOne(`${environment.apiUrl}/auth/login`).flush({ user: USER, token });

    const second = await createService();
    expect(second.isLoggedIn).toBeTrue();
    expect(second.currentUser?.email).toBe('a@b.co');
    expect(second.token).toBe(token.token);
  });

  it('drops expired persisted tokens', async () => {
    localStorage.setItem('jobswipe_auth_user', JSON.stringify(USER));
    localStorage.setItem('jobswipe_auth_token', JSON.stringify({
      token: 'old',
      expiresAt: new Date(Date.now() - 1000).toISOString()
    }));

    const service = await createService();
    expect(service.isLoggedIn).toBeFalse();
    expect(service.token).toBeNull();
  });

  it('refreshToken updates the stored token', async () => {
    const service = await createService();
    const oldToken = futureToken();
    service.login('a@b.co', 'pw').subscribe();
    http.expectOne(`${environment.apiUrl}/auth/login`).flush({ user: USER, token: oldToken });

    const newToken = futureToken();
    service.refreshToken().subscribe();
    const req = http.expectOne(`${environment.apiUrl}/auth/refresh`);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${oldToken.token}`);
    req.flush({ user: USER, token: newToken });

    expect(service.token).toBe(newToken.token);
  });

  it('refreshToken logs the user out when the server rejects the token', async () => {
    const service = await createService();
    service.login('a@b.co', 'pw').subscribe();
    http.expectOne(`${environment.apiUrl}/auth/login`).flush({ user: USER, token: futureToken() });

    let error: any;
    service.refreshToken().subscribe({ error: e => (error = e) });
    http.expectOne(`${environment.apiUrl}/auth/refresh`)
      .flush({ detail: 'Session expired' }, { status: 401, statusText: 'Unauthorized' });

    expect(error).toBeTruthy();
    expect(service.isLoggedIn).toBeFalse();
    expect(storage.get('jobswipe_auth_token')).toBeNull();
  });

  it('logout clears the stored session', async () => {
    const service = await createService();
    service.login('a@b.co', 'pw').subscribe();
    http.expectOne(`${environment.apiUrl}/auth/login`).flush({ user: USER, token: futureToken() });

    service.logout();
    expect(service.isLoggedIn).toBeFalse();
    expect(storage.get('jobswipe_auth_token')).toBeNull();
    expect(storage.get('jobswipe_auth_user')).toBeNull();
  });
});
