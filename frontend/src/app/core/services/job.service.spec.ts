import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { JobService, JobNotFoundError } from './job.service';
import { StorageService } from './storage.service';
import { environment } from '../../../environments/environment';
import { Job } from '../models/job.model';

function makeJob(url: string): Job {
  return {
    site: 'indeed',
    job_url: url,
    job_url_direct: null,
    title: 'Dev',
    company: 'Co',
    location: 'Remote',
    job_type: 'Full-time',
    date_posted: null,
    interval: null,
    min_amount: null,
    max_amount: null,
    currency: null,
    is_remote: true,
    emails: null,
    description: 'desc',
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
  };
}

describe('JobService', () => {
  let service: JobService;
  let http: HttpTestingController;
  let originalMockFlag: boolean;

  beforeEach(() => {
    localStorage.clear();
    originalMockFlag = environment.useMockJobsOnError;
    TestBed.configureTestingModule({
      providers: [
        JobService,
        StorageService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(JobService);
  });

  afterEach(() => {
    environment.useMockJobsOnError = originalMockFlag;
    http.verify();
    localStorage.clear();
  });

  it('posts paged search queries to /jobs/search', () => {
    let result: any;
    service.searchJobs({ keyword: 'react', page: 2, pageSize: 10 }).subscribe(r => (result = r));

    const req = http.expectOne(`${environment.apiUrl}/jobs/search`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      keyword: 'react',
      filters: null,
      page: 2,
      page_size: 10
    });
    req.flush({ data: [makeJob('https://a/1')], page: 2, page_size: 10, total: 11, has_more: false });
    expect(result.total).toBe(11);
  });

  it('maps filters to the API contract', () => {
    service.searchJobs({
      keyword: 'react',
      filters: { isRemote: true, jobType: 'Full-time', minSalary: 50000, technologies: ['react'] }
    }).subscribe();

    const req = http.expectOne(`${environment.apiUrl}/jobs/search`);
    expect(req.request.body.filters).toEqual({
      is_remote: true,
      job_type: 'Full-time',
      min_salary: 50000,
      technologies: ['react']
    });
    req.flush({ data: [], page: 1, page_size: 20, total: 0, has_more: false });
  });

  it('marks responses stale when a newer search supersedes them', () => {
    const results: any[] = [];
    service.searchJobs({ keyword: 'react', page: 1 }).subscribe(r => results.push(r));
    service.searchJobs({ keyword: 'angular', page: 1 }).subscribe(r => results.push(r));

    const reqs = http.match(`${environment.apiUrl}/jobs/search`);
    expect(reqs.length).toBe(2);
    // The older request resolves last; it must be flagged stale.
    reqs[1].flush({ data: [makeJob('https://a/2')], page: 1, page_size: 20, total: 1, has_more: false });
    reqs[0].flush({ data: [makeJob('https://a/1')], page: 1, page_size: 20, total: 1, has_more: false });

    expect(results[1].stale).toBeTrue();
    expect(results[0].stale).toBeUndefined();
  });

  it('propagates API errors when the dev mock flag is off (production behaviour)', () => {
    environment.useMockJobsOnError = false;
    let error: any;
    service.searchJobs({ keyword: 'react' }).subscribe({ error: e => (error = e) });

    const req = http.expectOne(`${environment.apiUrl}/jobs/search`);
    req.flush('Server error', { status: 500, statusText: 'Server Error' });

    expect(error).toBeTruthy();
    expect(error.status).toBe(500);
  });

  it('serves mock jobs only behind the explicit development flag', () => {
    environment.useMockJobsOnError = true;
    let result: any;
    service.searchJobs({ keyword: 'react' }).subscribe(r => (result = r));

    const req = http.expectOne(`${environment.apiUrl}/jobs/search`);
    req.flush('Server error', { status: 500, statusText: 'Server Error' });

    expect(result.data.length).toBe(2);
    expect(result.data[0].site).toBe('mock');
  });

  it('getJobDetails returns cached jobs without an HTTP call', () => {
    service.mergeIntoCache([makeJob('https://a/cached')]);
    let job: Job | undefined;
    service.getJobDetails('https://a/cached').subscribe(j => (job = j));
    expect(job?.title).toBe('Dev');
    http.expectNone(`${environment.apiUrl}/jobs/detail`);
  });

  it('getJobDetails fetches uncached jobs from the backend', () => {
    let job: Job | undefined;
    service.getJobDetails('https://a/remote').subscribe(j => (job = j));

    const req = http.expectOne(r => r.url === `${environment.apiUrl}/jobs/detail`);
    expect(req.request.params.get('url')).toBe('https://a/remote');
    req.flush({ data: makeJob('https://a/remote') });
    expect(job?.job_url).toBe('https://a/remote');
  });

  it('getJobDetails maps 404 to JobNotFoundError', () => {
    let error: any;
    service.getJobDetails('https://a/gone').subscribe({ error: e => (error = e) });

    const req = http.expectOne(r => r.url === `${environment.apiUrl}/jobs/detail`);
    req.flush({ detail: 'Job no longer available' }, { status: 404, statusText: 'Not Found' });

    expect(error instanceof JobNotFoundError).toBeTrue();
    expect(error.message).toBe('Job no longer available');
  });

  it('getJobDetails propagates network errors', () => {
    let error: any;
    service.getJobDetails('https://a/remote').subscribe({ error: e => (error = e) });

    const req = http.expectOne(r => r.url === `${environment.apiUrl}/jobs/detail`);
    req.flush('Server error', { status: 500, statusText: 'Server Error' });
    expect(error.status).toBe(500);
  });

  it('persists and reloads filters', () => {
    service.saveFilters(
      {
        isRemote: true,
        jobType: 'Contract',
        minSalary: 40000,
        maxSalary: null,
        datePostedWithinDays: 7,
        site: 'indeed',
        technologies: ['react']
      },
      'react'
    );
    const loaded = service.loadFilters();
    expect(loaded.keyword).toBe('react');
    expect(loaded.filters.isRemote).toBeTrue();
    expect(loaded.filters.jobType).toBe('Contract');
    expect(loaded.filters.technologies).toEqual(['react']);
  });
});
