import { Injectable } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest
} from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, filter, switchMap, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

/**
 * Attaches the bearer token and transparently recovers from expired sessions:
 * on a 401 from our own API it performs one single-flight token refresh,
 * retries the original request once, and logs the user out if the refresh
 * fails. Auth endpoints themselves are never retried (loop prevention).
 */
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private refreshInProgress = false;
  private refreshSubject = new BehaviorSubject<string | null>(null);

  constructor(private authService: AuthService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(this.addToken(req)).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401 && this.isApiRequest(req) && !this.isAuthEndpoint(req)) {
          return this.handle401(req, next);
        }
        return throwError(() => error);
      })
    );
  }

  private addToken(req: HttpRequest<any>): HttpRequest<any> {
    const token = this.authService.token;
    if (token && this.isApiRequest(req)) {
      return req.clone({
        setHeaders: { Authorization: `Bearer ${token}` }
      });
    }
    return req;
  }

  private handle401(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.refreshInProgress) {
      this.refreshInProgress = true;
      this.refreshSubject.next(null);

      return this.authService.refreshToken().pipe(
        switchMap(({ token }) => {
          this.refreshInProgress = false;
          this.refreshSubject.next(token.token);
          return next.handle(this.withToken(req, token.token));
        }),
        catchError(err => {
          this.refreshInProgress = false;
          // refreshToken() already logged the user out on failure.
          return throwError(() => err);
        })
      );
    }

    // Queue concurrent requests behind the in-flight refresh.
    return this.refreshSubject.pipe(
      filter(token => token !== null),
      take(1),
      switchMap(token => next.handle(this.withToken(req, token as string)))
    );
  }

  private withToken(req: HttpRequest<any>, token: string): HttpRequest<any> {
    return req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
  }

  private isApiRequest(req: HttpRequest<any>): boolean {
    return req.url.includes('/api/v1/');
  }

  private isAuthEndpoint(req: HttpRequest<any>): boolean {
    return /\/api\/v1\/auth\/(login|signup|refresh)/.test(req.url);
  }
}
