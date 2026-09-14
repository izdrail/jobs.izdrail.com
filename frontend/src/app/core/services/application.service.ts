import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { tap, map, catchError } from 'rxjs/operators';
import { Job, JobApplication, ApplicationStatus } from '../models/job.model';
import { AuthService } from './auth.service';
import { StorageService } from './storage.service';
import { PwaService } from './pwa.service';
import { environment } from '../../../environments/environment';

interface ServerApplication {
  id: string;
  jobUrl: string;
  jobTitle: string | null;
  jobCompany: string | null;
  jobLocation: string | null;
  jobSite: string | null;
  status: string;
  notes: string | null;
  statusHistory: { status: string; at: string }[] | null;
  createdAt: string;
}

interface PendingApplication {
  clientId: string;
  job: Job;
  queuedAt: string;
}

const OUTBOX_KEY = 'jobswipe_pending_applications';

/**
 * Application tracking with an offline outbox.
 *
 * Right-swipe applications are idempotent server-side ((user, job_url) is
 * unique and conflicts return 409), so they are safe to queue while offline
 * and retry on reconnect: a 409 during a sync simply means "already applied".
 */
@Injectable({
  providedIn: 'root'
})
export class ApplicationService {
  private apiUrl = environment.apiUrl;
  private applicationsSubject = new BehaviorSubject<JobApplication[]>([]);
  applications$ = this.applicationsSubject.asObservable();

  private appliedJobUrls = new Set<string>();
  private syncing = false;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private storage: StorageService,
    private pwaService: PwaService
  ) {
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.loadApplications();
      } else {
        this.applicationsSubject.next([]);
        this.appliedJobUrls.clear();
      }
    });

    // Flush queued applications when connectivity returns.
    this.pwaService.isOnline$.subscribe(online => {
      if (online && this.authService.isLoggedIn) {
        this.syncPendingApplications();
      }
    });
  }

  get pendingCount(): number {
    return this.readOutbox().length;
  }

  private loadApplications(): void {
    this.http.get<ServerApplication[]>(`${this.apiUrl}/applications`).pipe(
      catchError(() => of([]))
    ).subscribe(apps => {
      const mapped = apps.map((a: ServerApplication) => this.mapServerApp(a));
      this.appliedJobUrls.clear();
      mapped.forEach((a: JobApplication) => this.appliedJobUrls.add(a.job.job_url));
      this.emitWithPending(mapped);
      if (this.pwaService.isOnline) {
        this.syncPendingApplications();
      }
    });
  }

  applyToJob(job: Job): Observable<JobApplication> {
    if (!this.authService.isLoggedIn) {
      return throwError(() => new Error('Please sign in to apply for jobs'));
    }

    if (this.hasApplied(job.job_url)) {
      return throwError(() => new Error('Already applied to this job'));
    }

    if (!this.pwaService.isOnline) {
      return this.queueOffline(job);
    }

    return this.http.post<ServerApplication>(`${this.apiUrl}/applications`, {
      job_url: job.job_url,
      job_title: job.title,
      job_company: job.company,
      job_location: typeof job.location === 'string' ? job.location : JSON.stringify(job.location),
      job_description: job.description,
      job_site: job.site
    }).pipe(
      map(resp => this.mapServerApp(resp, job)),
      tap(app => {
        this.appliedJobUrls.add(job.job_url);
        this.emitWithPending([app, ...this.serverApplications()]);
      }),
      catchError((error: HttpErrorResponse) => {
        if (error.status === 0) {
          // Network dropped between the check and the request: queue it.
          return this.queueOffline(job);
        }
        return throwError(() => error);
      })
    );
  }

  updateStatus(id: string, status: ApplicationStatus): Observable<JobApplication> {
    return this.http
      .patch<ServerApplication>(`${this.apiUrl}/applications/${id}`, { status })
      .pipe(
        map(resp => this.mapServerApp(resp)),
        tap(updated => this.replaceApplication(updated))
      );
  }

  updateNotes(id: string, notes: string): Observable<JobApplication> {
    return this.http
      .patch<ServerApplication>(`${this.apiUrl}/applications/${id}`, { notes })
      .pipe(
        map(resp => this.mapServerApp(resp)),
        tap(updated => this.replaceApplication(updated))
      );
  }

  hasApplied(jobUrl: string): boolean {
    return this.appliedJobUrls.has(jobUrl);
  }

  getApplications(): JobApplication[] {
    return this.applicationsSubject.value;
  }

  removeApplication(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/applications/${id}`).pipe(
      tap(() => {
        const app = this.applicationsSubject.value.find(a => a.id === id);
        if (app) {
          this.appliedJobUrls.delete(app.job.job_url);
        }
        this.emitWithPending(
          this.serverApplications().filter(a => a.id !== id)
        );
      })
    );
  }

  /** Remove a queued (not yet synced) application. */
  removePending(clientId: string): void {
    const outbox = this.readOutbox().filter(p => p.clientId !== clientId);
    this.writeOutbox(outbox);
    this.emitWithPending(this.serverApplications());
  }

  /** Push queued applications to the server; 409 means "already applied". */
  syncPendingApplications(): void {
    if (this.syncing) {
      return;
    }
    const outbox = this.readOutbox();
    if (outbox.length === 0) {
      return;
    }
    this.syncing = true;

    const processNext = (remaining: PendingApplication[]): void => {
      if (remaining.length === 0) {
        this.syncing = false;
        this.loadApplications();
        return;
      }
      const [pending, ...rest] = remaining;
      this.http.post<ServerApplication>(`${this.apiUrl}/applications`, {
        job_url: pending.job.job_url,
        job_title: pending.job.title,
        job_company: pending.job.company,
        job_location: typeof pending.job.location === 'string'
          ? pending.job.location
          : JSON.stringify(pending.job.location),
        job_description: pending.job.description,
        job_site: pending.job.site
      }).pipe(
        catchError((error: HttpErrorResponse) => {
          if (error.status === 409) {
            return of('duplicate' as const);
          }
          // Still offline or a server error: keep this and the rest queued.
          return of('failed' as const);
        })
      ).subscribe(result => {
        if (result === 'failed') {
          this.syncing = false;
          return;
        }
        this.writeOutbox(this.readOutbox().filter(p => p.clientId !== pending.clientId));
        this.appliedJobUrls.add(pending.job.job_url);
        processNext(rest);
      });
    };

    processNext(outbox);
  }

  private queueOffline(job: Job): Observable<JobApplication> {
    const pending: PendingApplication = {
      clientId: `pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      job,
      queuedAt: new Date().toISOString()
    };
    this.writeOutbox([...this.readOutbox(), pending]);
    this.appliedJobUrls.add(job.job_url);
    this.emitWithPending(this.serverApplications());
    return of(this.mapPendingApp(pending));
  }

  private serverApplications(): JobApplication[] {
    return this.applicationsSubject.value.filter(a => !a.pendingSync);
  }

  private emitWithPending(serverApps: JobApplication[]): void {
    const pending = this.readOutbox().map(p => this.mapPendingApp(p));
    this.applicationsSubject.next([...pending, ...serverApps]);
  }

  private replaceApplication(updated: JobApplication): void {
    const apps = this.serverApplications().map(a => (a.id === updated.id ? updated : a));
    this.emitWithPending(apps);
  }

  private readOutbox(): PendingApplication[] {
    try {
      const data = this.storage.get(OUTBOX_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private writeOutbox(outbox: PendingApplication[]): void {
    this.storage.set(OUTBOX_KEY, JSON.stringify(outbox));
  }

  private mapPendingApp(p: PendingApplication): JobApplication {
    return {
      id: p.clientId,
      job: p.job,
      appliedAt: new Date(p.queuedAt),
      status: ApplicationStatus.Pending,
      notes: null,
      statusHistory: [],
      pendingSync: true
    };
  }

  private mapServerApp(a: ServerApplication, job?: Job): JobApplication {
    return {
      id: a.id,
      job: job || {
        job_url: a.jobUrl,
        title: a.jobTitle || 'Unknown',
        company: a.jobCompany || null,
        location: a.jobLocation || '',
        description: '',
        site: a.jobSite || '',
        job_url_direct: null,
        job_type: null,
        date_posted: null,
        interval: null,
        min_amount: null,
        max_amount: null,
        currency: null,
        is_remote: null,
        emails: null,
        company_url: null,
        company_url_direct: null,
        company_addresses: null,
        company_industry: null,
        company_num_employees: null,
        company_revenue: null,
        company_description: null,
        logo_photo_url: null,
        banner_photo_url: null,
        ceo_name: null,
        ceo_photo_url: null
      },
      appliedAt: new Date(a.createdAt),
      status: a.status as ApplicationStatus,
      notes: a.notes ?? null,
      statusHistory: a.statusHistory ?? [],
      pendingSync: false
    };
  }
}
