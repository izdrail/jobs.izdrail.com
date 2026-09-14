import { HttpHandler, HttpRequest, HttpResponse, HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { AuthInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

function handlerRespond(...responses: (HttpResponse<any> | HttpErrorResponse)[]): HttpHandler & { calls: number } {
  let calls = 0;
  const handler: HttpHandler & { calls: number } = {
    calls: 0,
    handle: (_req: HttpRequest<any>) => {
      calls++;
      handler.calls = calls;
      const response = responses[Math.min(calls - 1, responses.length - 1)];
      if (response instanceof HttpErrorResponse) {
        return throwError(() => response);
      }
      return of(response);
    }
  };
  return handler;
}

const UNAUTHORIZED = new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' });

describe('AuthInterceptor', () => {
  let authService: jasmine.SpyObj<AuthService> & { token: string | null };
  let interceptor: AuthInterceptor;

  beforeEach(() => {
    authService = jasmine.createSpyObj('AuthService', ['refreshToken', 'logout']) as any;
    authService.token = 'old-token';
    interceptor = new AuthInterceptor(authService);
  });

  it('attaches the bearer token to API requests', (done) => {
    const handler = handlerRespond(new HttpResponse({ body: {} }));
    let seenAuth: string | null = null;
    const spyHandler: HttpHandler = {
      handle: (req: HttpRequest<any>) => {
        seenAuth = req.headers.get('Authorization');
        return of(new HttpResponse({ body: {} }));
      }
    };

    interceptor.intercept(new HttpRequest('GET', 'https://x/api/v1/jobs'), spyHandler)
      .subscribe(() => {
        expect(seenAuth).toBe('Bearer old-token');
        done();
      });
  });

  it('on 401 refreshes once and retries the request with the new token', (done) => {
    authService.refreshToken.and.returnValue(of({
      user: { id: 'u', email: 'e', name: null, createdAt: '' },
      token: { token: 'new-token', expiresAt: new Date(Date.now() + 99999).toISOString() }
    }));

    const auths: (string | null)[] = [];
    let calls = 0;
    const handler: HttpHandler = {
      handle: (req: HttpRequest<any>) => {
        calls++;
        auths.push(req.headers.get('Authorization'));
        if (calls === 1) {
          return throwError(() => UNAUTHORIZED);
        }
        return of(new HttpResponse({ body: { ok: true } }));
      }
    };

    interceptor.intercept(new HttpRequest('GET', 'https://x/api/v1/applications'), handler)
      .subscribe(response => {
        expect(response instanceof HttpResponse).toBeTrue();
        expect(calls).toBe(2);
        expect(auths[0]).toBe('Bearer old-token');
        expect(auths[1]).toBe('Bearer new-token');
        expect(authService.refreshToken).toHaveBeenCalledTimes(1);
        done();
      });
  });

  it('propagates the error when refresh fails', (done) => {
    authService.refreshToken.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 401 }))
    );

    interceptor.intercept(
      new HttpRequest('GET', 'https://x/api/v1/applications'),
      handlerRespond(UNAUTHORIZED)
    ).subscribe({
      error: err => {
        expect(err.status).toBe(401);
        expect(authService.refreshToken).toHaveBeenCalledTimes(1);
        done();
      }
    });
  });

  it('never retries auth endpoints (loop prevention)', (done) => {
    const handler = handlerRespond(UNAUTHORIZED);
    interceptor.intercept(new HttpRequest('POST', 'https://x/api/v1/auth/refresh', {}), handler)
      .subscribe({
        error: err => {
          expect(err.status).toBe(401);
          expect(authService.refreshToken).not.toHaveBeenCalled();
          expect(handler.calls).toBe(1);
          done();
        }
      });
  });

  it('does not attach tokens to non-API requests', (done) => {
    let seenAuth: string | null = null;
    const spyHandler: HttpHandler = {
      handle: (req: HttpRequest<any>) => {
        seenAuth = req.headers.get('Authorization');
        return of(new HttpResponse({ body: {} }));
      }
    };

    interceptor.intercept(new HttpRequest('GET', 'https://other.example.com/data'), spyHandler)
      .subscribe(() => {
        expect(seenAuth).toBeNull();
        done();
      });
  });
});
