import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { SwipeEvent } from '../models/user.model';
import { AuthService } from './auth.service';

const TRACKING_ENDPOINT = 'https://jsonplaceholder.typicode.com/posts';

@Injectable({
  providedIn: 'root'
})
export class SwipeTrackingService {
  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  trackSwipe(jobId: string, direction: 'left' | 'right'): void {
    const event: SwipeEvent = {
      userId: this.authService.currentUser?.id || null,
      jobId,
      direction,
      timestamp: new Date().toISOString()
    };

    this.http.post(TRACKING_ENDPOINT, event).pipe(
      catchError(err => {
        console.warn('Swipe tracking failed:', err.message);
        return of(null);
      })
    ).subscribe();
  }
}
