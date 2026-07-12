import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { AuthService } from './auth.service';
import { User } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  currentUser$: Observable<User | null>;
  displayName$: Observable<string>;

  constructor(private authService: AuthService) {
    this.currentUser$ = this.authService.currentUser$;
    this.displayName$ = this.currentUser$.pipe(
      map(user => user?.name || user?.email?.split('@')[0] || 'Guest')
    );
  }

  get isLoggedIn(): boolean {
    return this.authService.isLoggedIn;
  }

  get currentUser(): User | null {
    return this.authService.currentUser;
  }

  get displayName(): string {
    const user = this.currentUser;
    return user?.name || user?.email?.split('@')[0] || 'Guest';
  }

  getInitial(): string {
    const name = this.displayName;
    return name ? name.charAt(0).toUpperCase() : '?';
  }
}
