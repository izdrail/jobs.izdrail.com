import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError } from 'rxjs/operators';
import { of, Observable } from 'rxjs';
import { AuthService } from './auth.service';
import { PwaService } from './pwa.service';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SwipeTrackingService {
  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private pwaService: PwaService
  ) {}

  /** Best-effort swipe telemetry; dropped silently while offline. */
  trackSwipe(jobUrl: string, direction: 'left' | 'right'): void {
    if (!this.authService.isLoggedIn || !this.pwaService.isOnline) {
      return;
    }

    this.http.post(`${this.apiUrl}/swipes`, {
      job_url: jobUrl,
      direction
    }).pipe(
      catchError(err => {
        console.warn('Swipe tracking failed:', err.message);
        return of(null);
      })
    ).subscribe();
  }

  /** Remove the user's most recent swipe for a job (undo support). */
  undoLastSwipe(jobUrl: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/swipes/last`, {
      params: { job_url: jobUrl }
    });
  }
}
