import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { User, AuthToken } from '../models/user.model';
import { environment } from '../../../environments/environment';

const AUTH_TOKEN_KEY = 'jobswipe_auth_token';
const AUTH_USER_KEY = 'jobswipe_auth_user';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(this.loadUser());
  private tokenSubject = new BehaviorSubject<AuthToken | null>(this.loadToken());

  currentUser$: Observable<User | null> = this.currentUserSubject.asObservable();
  isLoggedIn$: Observable<boolean> = this.currentUserSubject.asObservable().pipe(
    map(user => user !== null)
  );
  token$: Observable<AuthToken | null> = this.tokenSubject.asObservable();

  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }

  get isLoggedIn(): boolean {
    return this.currentUserSubject.value !== null;
  }

  get token(): string | null {
    return this.tokenSubject.value?.token || null;
  }

  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {
    this.cleanExpiredToken();
  }

  signUp(email: string, password: string, name?: string): Observable<{ user: User; token: AuthToken }> {
    return this.http.post<{ user: User; token: AuthToken }>(`${this.apiUrl}/auth/signup`, {
      email,
      password,
      name
    }).pipe(
      tap(({ user, token }) => {
        this.saveUser(user);
        this.saveToken(token);
        this.currentUserSubject.next(user);
        this.tokenSubject.next(token);
      })
    );
  }

  login(email: string, password: string): Observable<{ user: User; token: AuthToken }> {
    return this.http.post<{ user: User; token: AuthToken }>(`${this.apiUrl}/auth/login`, {
      email,
      password
    }).pipe(
      tap(({ user, token }) => {
        this.saveUser(user);
        this.saveToken(token);
        this.currentUserSubject.next(user);
        this.tokenSubject.next(token);
      })
    );
  }

  logout(): void {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    this.currentUserSubject.next(null);
    this.tokenSubject.next(null);
  }

  private loadUser(): User | null {
    try {
      const data = localStorage.getItem(AUTH_USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  private loadToken(): AuthToken | null {
    try {
      const data = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!data) return null;
      const token: AuthToken = JSON.parse(data);
      if (new Date(token.expiresAt) < new Date()) {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        return null;
      }
      return token;
    } catch {
      return null;
    }
  }

  private saveUser(user: User): void {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  }

  private saveToken(token: AuthToken): void {
    localStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify(token));
  }

  private cleanExpiredToken(): void {
    const token = this.loadToken();
    if (!token) {
      this.currentUserSubject.next(null);
      this.tokenSubject.next(null);
    }
  }
}
