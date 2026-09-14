import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import {
  Job,
  JobSearchResponse,
  JobSearchPage,
  JobSearchQuery,
  JobFilters,
  DEFAULT_JOB_FILTERS
} from '../models/job.model';
import { environment } from '../../../environments/environment';
import { StorageService } from './storage.service';

const JOBS_CACHE_KEY = 'jobswipe_jobs_cache';
const JOBS_CACHE_TS_KEY = 'jobswipe_jobs_cache_ts';
const FILTERS_KEY = 'jobswipe_search_filters';
const CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

/** Thrown when the backend reports a job is gone (HTTP 404). */
export class JobNotFoundError extends Error {
  constructor(public readonly jobUrl: string) {
    super('Job no longer available');
    this.name = 'JobNotFoundError';
  }
}

@Injectable({
  providedIn: 'root'
})
export class JobService {
  private readonly apiUrl = environment.apiUrl;

  private cachedJobs: Job[] = [];
  private requestSeq = 0;

  constructor(
    private http: HttpClient,
    private storage: StorageService
  ) {
    this.loadFromStorage();
  }

  /**
   * Paged, filtered search against POST /jobs/search.
   *
   * API failures always surface as errors. Mock jobs exist only behind the
   * explicit development flag; environment.prod.ts sets it to false, so a
   * production build can never silently display fake jobs.
   */
  searchJobs(query: JobSearchQuery): Observable<JobSearchPage> {
    const seq = ++this.requestSeq;
    const body = {
      keyword: query.keyword,
      filters: this.toApiFilters(query.filters),
      page: query.page ?? 1,
      page_size: query.pageSize ?? 20
    };

    return this.http.post<JobSearchPage>(`${this.apiUrl}/jobs/search`, body).pipe(
      map(page => {
        if (seq !== this.requestSeq) {
          // A newer search superseded this one; discard the stale response.
          return { data: [], page: query.page ?? 1, page_size: query.pageSize ?? 20, total: 0, has_more: false, stale: true };
        }
        return page;
      }),
      catchError((error: HttpErrorResponse) => {
        if (environment.useMockJobsOnError) {
          console.warn('Job search failed, serving development mock data:', error.message);
          return of({
            data: this.getMockJobs(query.keyword),
            page: 1,
            page_size: 2,
            total: 2,
            has_more: false
          });
        }
        return throwError(() => error);
      })
    );
  }

  /** Merge a fresh page into the local cache (deduped by job_url). */
  mergeIntoCache(jobs: Job[]): Job[] {
    const newJobs = jobs.filter(
      job => !this.cachedJobs.some(cached => cached.job_url === job.job_url)
    );
    this.cachedJobs = [...this.cachedJobs, ...newJobs];
    this.saveToStorage();
    return this.cachedJobs;
  }

  clearCache(): void {
    this.cachedJobs = [];
    this.storage.remove(JOBS_CACHE_KEY);
    this.storage.remove(JOBS_CACHE_TS_KEY);
  }

  hasCachedJobs(): boolean {
    return this.cachedJobs.length > 0;
  }

  getCachedJobs(): Job[] {
    return this.cachedJobs;
  }

  removeJobFromCache(jobUrl: string): void {
    this.cachedJobs = this.cachedJobs.filter(j => j.job_url !== jobUrl);
    this.saveToStorage();
  }

  /**
   * Resolve a job by its job_url identifier: local cache first, then the
   * backend. A 404 becomes a typed JobNotFoundError so callers can show a
   * clear "job no longer available" state.
   */
  getJobDetails(jobUrl: string): Observable<Job> {
    const cached = this.cachedJobs.find(j => j.job_url === jobUrl);
    if (cached) {
      return of(cached);
    }

    return this.http
      .get<{ data: Job }>(`${this.apiUrl}/jobs/detail`, {
        params: { url: jobUrl }
      })
      .pipe(
        map(response => response.data),
        catchError((error: HttpErrorResponse) => {
          if (error.status === 404) {
            return throwError(() => new JobNotFoundError(jobUrl));
          }
          return throwError(() => error);
        })
      );
  }

  saveFilters(filters: JobFilters, keyword: string): void {
    this.storage.set(FILTERS_KEY, JSON.stringify({ filters, keyword }));
  }

  loadFilters(): { filters: JobFilters; keyword: string } {
    try {
      const data = this.storage.get(FILTERS_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        return {
          filters: { ...DEFAULT_JOB_FILTERS, ...(parsed.filters || {}) },
          keyword: parsed.keyword || ''
        };
      }
    } catch {
      // ignore corrupt state
    }
    return { filters: { ...DEFAULT_JOB_FILTERS }, keyword: '' };
  }

  private toApiFilters(filters?: Partial<JobFilters>): Record<string, unknown> | null {
    if (!filters) {
      return null;
    }
    const api: Record<string, unknown> = {};
    if (filters.isRemote !== null && filters.isRemote !== undefined) {
      api['is_remote'] = filters.isRemote;
    }
    if (filters.jobType) {
      api['job_type'] = filters.jobType;
    }
    if (filters.minSalary !== null && filters.minSalary !== undefined) {
      api['min_salary'] = filters.minSalary;
    }
    if (filters.maxSalary !== null && filters.maxSalary !== undefined) {
      api['max_salary'] = filters.maxSalary;
    }
    if (filters.datePostedWithinDays) {
      api['date_posted_within_days'] = filters.datePostedWithinDays;
    }
    if (filters.site) {
      api['site'] = filters.site;
    }
    if (filters.technologies && filters.technologies.length > 0) {
      api['technologies'] = filters.technologies;
    }
    return Object.keys(api).length > 0 ? api : null;
  }

  extractTechnologies(description: string): string[] {
    const techKeywords = [
      'React', 'Angular', 'Vue', 'Vue.js', 'Node.js', 'Node',
      'Python', 'Java', 'TypeScript', 'JavaScript', 'Go', 'Golang',
      'Rust', 'C#', 'C++', 'Ruby', 'PHP', 'Swift', 'Kotlin',
      'Docker', 'Kubernetes', 'K8s', 'AWS', 'Azure', 'GCP',
      'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'GraphQL', 'REST',
      'Django', 'Flask', 'FastAPI', 'Spring', 'Laravel', 'Express',
      'Next.js', 'Nuxt', 'Svelte', 'React Native', 'Flutter',
      'CI/CD', 'Terraform', 'Ansible', 'Jenkins', 'GitLab',
      'Microservices', 'Serverless', 'Firebase', 'Supabase'
    ];

    const found: string[] = [];
    const lowerDesc = description.toLowerCase();

    for (const tech of techKeywords) {
      if (lowerDesc.includes(tech.toLowerCase())) {
        found.push(tech);
      }
    }

    return found.slice(0, 6);
  }

  getCompanyInitial(companyName: string | null): string {
    if (!companyName) return '?';
    return companyName.charAt(0).toUpperCase();
  }

  getCompanyColor(companyName: string | null): string {
    if (!companyName) return '#6C63FF';
    const colors = [
      '#6C63FF', '#BB86FC', '#03DAC6', '#2dd36f',
      '#eb445a', '#ffc409', '#FF6B6B', '#4ECDC4',
      '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'
    ];
    let hash = 0;
    for (let i = 0; i < companyName.length; i++) {
      hash = companyName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  formatSalary(min: number | null, max: number | null, currency: string | null): string {
    if (!min && !max) return '';
    const curr = currency || '$';
    if (min && max) {
      return `${curr}${(min / 1000).toFixed(0)}k - ${curr}${(max / 1000).toFixed(0)}k`;
    }
    if (min) return `From ${curr}${(min / 1000).toFixed(0)}k`;
    return `Up to ${curr}${(max! / 1000).toFixed(0)}k`;
  }

  private saveToStorage(): void {
    this.storage.set(JOBS_CACHE_KEY, JSON.stringify(this.cachedJobs));
    this.storage.set(JOBS_CACHE_TS_KEY, Date.now().toString());
  }

  private loadFromStorage(): void {
    try {
      const ts = this.storage.get(JOBS_CACHE_TS_KEY);
      if (ts && (Date.now() - parseInt(ts, 10)) > CACHE_MAX_AGE_MS) {
        this.storage.remove(JOBS_CACHE_KEY);
        this.storage.remove(JOBS_CACHE_TS_KEY);
        return;
      }
      const data = this.storage.get(JOBS_CACHE_KEY);
      if (data) {
        this.cachedJobs = JSON.parse(data);
      }
    } catch {
      // parse error or storage unavailable
    }
  }

  /** Development-only fixture data; unreachable when useMockJobsOnError is false. */
  private getMockJobs(keyword: string): Job[] {
    const mockJobs: Job[] = [
      {
        site: 'mock',
        job_url: `https://example.com/job/1-${keyword}`,
        job_url_direct: null,
        title: `Senior ${keyword.charAt(0).toUpperCase() + keyword.slice(1)} Developer`,
        company: 'TechCorp',
        location: 'Remote',
        job_type: 'Full-time',
        date_posted: new Date().toISOString(),
        interval: 'yearly',
        min_amount: 80000,
        max_amount: 120000,
        currency: '$',
        is_remote: true,
        emails: null,
        description: `We are looking for a Senior ${keyword} Developer to join our team. You will work on cutting-edge projects using modern technologies. Requirements: 5+ years experience with ${keyword}, strong problem-solving skills, and excellent communication.`,
        company_url: null,
        company_url_direct: null,
        company_addresses: null,
        company_industry: 'Technology',
        company_num_employees: '100-500',
        company_revenue: null,
        company_description: 'A leading technology company',
        logo_photo_url: null,
        banner_photo_url: null,
        ceo_name: null,
        ceo_photo_url: null
      },
      {
        site: 'mock',
        job_url: `https://example.com/job/2-${keyword}`,
        job_url_direct: null,
        title: `${keyword.charAt(0).toUpperCase() + keyword.slice(1)} Engineer`,
        company: 'StartupXYZ',
        location: 'New York, NY',
        job_type: 'Full-time',
        date_posted: new Date().toISOString(),
        interval: 'yearly',
        min_amount: 90000,
        max_amount: 140000,
        currency: '$',
        is_remote: false,
        emails: null,
        description: `Join our growing team as a ${keyword} Engineer. We're building the next generation of developer tools. Tech stack includes ${keyword}, TypeScript, Docker, AWS, and more.`,
        company_url: null,
        company_url_direct: null,
        company_addresses: null,
        company_industry: 'Developer Tools',
        company_num_employees: '10-50',
        company_revenue: null,
        company_description: 'An innovative startup',
        logo_photo_url: null,
        banner_photo_url: null,
        ceo_name: null,
        ceo_photo_url: null
      }
    ];
    return mockJobs;
  }
}
