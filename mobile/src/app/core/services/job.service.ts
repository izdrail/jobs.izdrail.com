import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { Job, JobSearchResponse, JobSearchRequest } from '../models/job.model';

const JOBS_CACHE_KEY = 'jobswipe_jobs_cache';
const JOBS_CACHE_TS_KEY = 'jobswipe_jobs_cache_ts';
const CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

@Injectable({
  providedIn: 'root'
})
export class JobService {
  private readonly apiUrl = 'https://jobs.izdrail.com/api/v1/jobs';

  private readonly searchKeywords = [
    'react', 'angular', 'vue', 'python', 'java', 'node',
    'typescript', 'flutter', 'go', 'rust', 'devops', 'aws',
    'fullstack', 'frontend', 'backend', 'mobile', 'kubernetes'
  ];

  private cachedJobs: Job[] = [];
  private currentKeywordIndex = 0;
  private loaded = false;

  constructor(private http: HttpClient) {
    this.loadFromStorage();
  }

  searchJobs(keyword: string): Observable<Job[]> {
    const request: JobSearchRequest = { keyword };
    return this.http.post<JobSearchResponse>(this.apiUrl, request).pipe(
      map(response => response.data || []),
      catchError(error => {
        console.warn('Job search failed, using mock data:', error.message);
        return of(this.getMockJobs(keyword));
      })
    );
  }

  loadJobs(): Observable<Job[]> {
    const keyword = this.searchKeywords[this.currentKeywordIndex % this.searchKeywords.length];
    this.currentKeywordIndex++;

    return this.searchJobs(keyword).pipe(
      map(jobs => {
        const newJobs = jobs.filter(
          job => !this.cachedJobs.some(cached => cached.job_url === job.job_url)
        );
        this.cachedJobs = [...this.cachedJobs, ...newJobs];
        this.saveToStorage();
        return this.cachedJobs;
      })
    );
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

  getJobDetails(jobUrl: string): Observable<Job | undefined> {
    const job = this.cachedJobs.find(j => j.job_url === jobUrl);
    return of(job);
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
    try {
      localStorage.setItem(JOBS_CACHE_KEY, JSON.stringify(this.cachedJobs));
      localStorage.setItem(JOBS_CACHE_TS_KEY, Date.now().toString());
    } catch {
      // quota exceeded or storage unavailable
    }
  }

  private loadFromStorage(): void {
    try {
      const ts = localStorage.getItem(JOBS_CACHE_TS_KEY);
      if (ts && (Date.now() - parseInt(ts, 10)) > CACHE_MAX_AGE_MS) {
        localStorage.removeItem(JOBS_CACHE_KEY);
        localStorage.removeItem(JOBS_CACHE_TS_KEY);
        return;
      }
      const data = localStorage.getItem(JOBS_CACHE_KEY);
      if (data) {
        this.cachedJobs = JSON.parse(data);
        this.loaded = true;
      }
    } catch {
      // parse error or storage unavailable
    }
  }

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
