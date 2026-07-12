import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { delay, map, tap } from 'rxjs/operators';
import { User, AuthToken } from '../models/user.model';

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

  constructor() {
    this.cleanExpiredToken();
  }

  signUp(email: string, password: string, name?: string): Observable<{ user: User; token: AuthToken }> {
    const existingUsers = this.getStoredUsers();
    if (existingUsers.find(u => u.email === email)) {
      return throwError(() => new Error('An account with this email already exists'));
    }

    const user: User = {
      id: this.generateId(),
      email,
      name: name || email.split('@')[0],
      createdAt: new Date().toISOString()
    };

    const token: AuthToken = {
      token: this.generateToken(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };

    existingUsers.push({ ...user, password });
    this.saveStoredUsers(existingUsers);

    return of({ user, token }).pipe(
      delay(800),
      tap(({ user: u, token: t }) => {
        this.saveUser(u);
        this.saveToken(t);
        this.currentUserSubject.next(u);
        this.tokenSubject.next(t);
      })
    );
  }

  login(email: string, password: string): Observable<{ user: User; token: AuthToken }> {
    const existingUsers = this.getStoredUsers();
    const found = existingUsers.find(u => u.email === email && u.password === password);

    if (!found) {
      return throwError(() => new Error('Invalid email or password'));
    }

    const { password: _, ...user } = found;
    const token: AuthToken = {
      token: this.generateToken(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };

    return of({ user, token }).pipe(
      delay(800),
      tap(({ user: u, token: t }) => {
        this.saveUser(u);
        this.saveToken(t);
        this.currentUserSubject.next(u);
        this.tokenSubject.next(t);
      })
    );
  }

  logout(): void {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    this.currentUserSubject.next(null);
    this.tokenSubject.next(null);
  }

  private generateId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateToken(): string {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({
      sub: this.generateId(),
      iat: Date.now(),
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000
    }));
    const signature = btoa(Math.random().toString(36).substr(2));
    return `${header}.${payload}.${signature}`;
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

  private getStoredUsers(): Array<User & { password: string }> {
    try {
      const data = localStorage.getItem('jobswipe_users');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private saveStoredUsers(users: Array<User & { password: string }>): void {
    localStorage.setItem('jobswipe_users', JSON.stringify(users));
  }
}
