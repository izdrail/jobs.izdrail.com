import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SwipeTrackingService {
  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  trackSwipe(jobUrl: string, direction: 'left' | 'right'): void {
    if (!this.authService.isLoggedIn) {
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
}
