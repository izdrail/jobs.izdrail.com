import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { tap, map, catchError } from 'rxjs/operators';
import { Job, JobApplication, ApplicationStatus } from '../models/job.model';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

interface ApplicationResponse {
  id: string;
  jobUrl: string;
  status: string;
  createdAt: string;
}

interface ServerApplication {
  id: string;
  jobUrl: string;
  jobTitle: string | null;
  jobCompany: string | null;
  jobLocation: string | null;
  jobSite: string | null;
  status: string;
  createdAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApplicationService {
  private apiUrl = environment.apiUrl;
  private applicationsSubject = new BehaviorSubject<JobApplication[]>([]);
  applications$ = this.applicationsSubject.asObservable();

  private appliedJobUrls = new Set<string>();
  private loaded = false;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.loadApplications();
      } else {
        this.applicationsSubject.next([]);
        this.appliedJobUrls.clear();
        this.loaded = false;
      }
    });
  }

  private loadApplications(): void {
    this.http.get<ServerApplication[]>(`${this.apiUrl}/applications`).pipe(
      catchError(() => of([]))
    ).subscribe(apps => {
      const mapped = apps.map((a: ServerApplication) => this.mapServerApp(a));
      this.applicationsSubject.next(mapped);
      this.appliedJobUrls.clear();
      mapped.forEach((a: JobApplication) => this.appliedJobUrls.add(a.job.job_url));
      this.loaded = true;
    });
  }

  applyToJob(job: Job): Observable<JobApplication> {
    if (!this.authService.isLoggedIn) {
      return throwError(() => new Error('Please sign in to apply for jobs'));
    }

    if (this.hasApplied(job.job_url)) {
      return throwError(() => new Error('Already applied to this job'));
    }

    return this.http.post<ApplicationResponse>(`${this.apiUrl}/applications`, {
      job_url: job.job_url,
      job_title: job.title,
      job_company: job.company,
      job_location: typeof job.location === 'string' ? job.location : JSON.stringify(job.location),
      job_description: job.description,
      job_site: job.site
    }).pipe(
      map(resp => ({
        id: resp.id,
        job,
        appliedAt: new Date(resp.createdAt),
        status: ApplicationStatus.Pending
      } as JobApplication)),
      tap(app => {
        const current = this.applicationsSubject.value;
        const updated = [app, ...current];
        this.applicationsSubject.next(updated);
        this.appliedJobUrls.add(job.job_url);
      })
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
        const current = this.applicationsSubject.value;
        const app = current.find(a => a.id === id);
        if (app) {
          this.appliedJobUrls.delete(app.job.job_url);
        }
        const updated = current.filter(a => a.id !== id);
        this.applicationsSubject.next(updated);
      })
    );
  }

  private mapServerApp(a: ServerApplication): JobApplication {
    return {
      id: a.id,
      job: {
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
      status: a.status as ApplicationStatus
    };
  }
}
