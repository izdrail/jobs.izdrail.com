import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { delay, tap } from 'rxjs/operators';
import { Job, JobApplication, ApplicationStatus, SwipeAction } from '../models/job.model';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class ApplicationService {
  private readonly STORAGE_KEY = 'jobswipe_applications';

  private applicationsSubject = new BehaviorSubject<JobApplication[]>(this.loadFromStorage());
  applications$ = this.applicationsSubject.asObservable();

  private appliedJobUrls = new Set<string>();

  constructor(private authService: AuthService) {
    const apps = this.loadFromStorage();
    apps.forEach(app => this.appliedJobUrls.add(app.job.job_url));
  }

  applyToJob(job: Job): Observable<JobApplication> {
    if (!this.authService.isLoggedIn) {
      return throwError(() => new Error('Please sign in to apply for jobs'));
    }

    if (this.hasApplied(job.job_url)) {
      return throwError(() => new Error('Already applied to this job'));
    }

    const application: JobApplication = {
      id: this.generateId(),
      job,
      appliedAt: new Date(),
      status: ApplicationStatus.Pending
    };

    return of(application).pipe(
      delay(800),
      tap(app => {
        const current = this.applicationsSubject.value;
        const updated = [app, ...current];
        this.applicationsSubject.next(updated);
        this.appliedJobUrls.add(job.job_url);
        this.saveToStorage(updated);
      })
    );
  }

  hasApplied(jobUrl: string): boolean {
    return this.appliedJobUrls.has(jobUrl);
  }

  getApplications(): JobApplication[] {
    return this.applicationsSubject.value;
  }

  removeApplication(id: string): void {
    const current = this.applicationsSubject.value;
    const app = current.find(a => a.id === id);
    if (app) {
      this.appliedJobUrls.delete(app.job.job_url);
    }
    const updated = current.filter(a => a.id !== id);
    this.applicationsSubject.next(updated);
    this.saveToStorage(updated);
  }

  private loadFromStorage(): JobApplication[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) {
        const apps = JSON.parse(data);
        return apps.map((app: any) => ({
          ...app,
          appliedAt: new Date(app.appliedAt)
        }));
      }
    } catch {
      // ignore
    }
    return [];
  }

  private saveToStorage(applications: JobApplication[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(applications));
    } catch {
      // ignore
    }
  }

  private generateId(): string {
    return `app_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
