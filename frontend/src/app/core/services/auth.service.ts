import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { map, tap, catchError } from 'rxjs/operators';
import { User, AuthToken } from '../models/user.model';
import { environment } from '../../../environments/environment';
import { StorageService } from './storage.service';

const AUTH_TOKEN_KEY = 'jobswipe_auth_token';
const AUTH_USER_KEY = 'jobswipe_auth_user';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject: BehaviorSubject<User | null>;
  private tokenSubject: BehaviorSubject<AuthToken | null>;

  currentUser$: Observable<User | null>;
  isLoggedIn$: Observable<boolean>;
  token$: Observable<AuthToken | null>;

  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private storage: StorageService
  ) {
    this.currentUserSubject = new BehaviorSubject<User | null>(this.loadUser());
    this.tokenSubject = new BehaviorSubject<AuthToken | null>(this.loadToken());
    this.currentUser$ = this.currentUserSubject.asObservable();
    this.token$ = this.tokenSubject.asObservable();
    this.isLoggedIn$ = this.currentUserSubject.asObservable().pipe(
      map(user => user !== null)
    );
    this.cleanExpiredToken();
  }

  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }

  get isLoggedIn(): boolean {
    return this.currentUserSubject.value !== null;
  }

  get token(): string | null {
    return this.tokenSubject.value?.token || null;
  }

  signUp(email: string, password: string, name?: string): Observable<{ user: User; token: AuthToken }> {
    return this.http.post<{ user: User; token: AuthToken }>(`${this.apiUrl}/auth/signup`, {
      email,
      password,
      name
    }).pipe(
      tap(({ user, token }) => this.setSession(user, token))
    );
  }

  login(email: string, password: string): Observable<{ user: User; token: AuthToken }> {
    return this.http.post<{ user: User; token: AuthToken }>(`${this.apiUrl}/auth/login`, {
      email,
      password
    }).pipe(
      tap(({ user, token }) => this.setSession(user, token))
    );
  }

  /**
   * Exchange the current (or recently expired) token for a fresh one.
   * Used by the auth interceptor on 401 responses.
   */
  refreshToken(): Observable<{ user: User; token: AuthToken }> {
    const current = this.token;
    if (!current) {
      return throwError(() => new Error('No token to refresh'));
    }
    return this.http.post<{ user: User; token: AuthToken }>(
      `${this.apiUrl}/auth/refresh`,
      {},
      { headers: { Authorization: `Bearer ${current}` } }
    ).pipe(
      tap(({ user, token }) => this.setSession(user, token)),
      catchError(err => {
        this.logout();
        return throwError(() => err);
      })
    );
  }

  logout(): void {
    this.storage.remove(AUTH_TOKEN_KEY);
    this.storage.remove(AUTH_USER_KEY);
    this.currentUserSubject.next(null);
    this.tokenSubject.next(null);
  }

  private setSession(user: User, token: AuthToken): void {
    this.saveUser(user);
    this.saveToken(token);
    this.currentUserSubject.next(user);
    this.tokenSubject.next(token);
  }

  private loadUser(): User | null {
    try {
      const data = this.storage.get(AUTH_USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  private loadToken(): AuthToken | null {
    try {
      const data = this.storage.get(AUTH_TOKEN_KEY);
      if (!data) return null;
      const token: AuthToken = JSON.parse(data);
      if (new Date(token.expiresAt) < new Date()) {
        this.storage.remove(AUTH_TOKEN_KEY);
        return null;
      }
      return token;
    } catch {
      return null;
    }
  }

  private saveUser(user: User): void {
    this.storage.set(AUTH_USER_KEY, JSON.stringify(user));
  }

  private saveToken(token: AuthToken): void {
    this.storage.set(AUTH_TOKEN_KEY, JSON.stringify(token));
  }

  private cleanExpiredToken(): void {
    const token = this.loadToken();
    if (!token) {
      this.currentUserSubject.next(null);
      this.tokenSubject.next(null);
    }
  }
}
