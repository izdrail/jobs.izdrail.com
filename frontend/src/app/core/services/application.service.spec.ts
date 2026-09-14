import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { BehaviorSubject } from 'rxjs';
import { ApplicationService } from './application.service';
import { AuthService } from './auth.service';
import { StorageService } from './storage.service';
import { PwaService } from './pwa.service';
import { environment } from '../../../environments/environment';
import { Job, ApplicationStatus } from '../models/job.model';

function makeJob(url: string): Job {
  return {
    site: 'indeed', job_url: url, job_url_direct: null, title: 'Dev', company: 'Co',
    location: 'Remote', job_type: null, date_posted: null, interval: null,
    min_amount: null, max_amount: null, currency: null, is_remote: null, emails: null,
    description: '', company_url: null, company_url_direct: null, company_addresses: null,
    company_industry: null, company_num_employees: null, company_revenue: null,
    company_description: null, logo_photo_url: null, banner_photo_url: null,
    ceo_name: null, ceo_photo_url: null
  };
}

function serverApp(id: string, jobUrl: string) {
  return {
    id, jobUrl, jobTitle: 'Dev', jobCompany: 'Co', jobLocation: 'Remote',
    jobSite: 'indeed', status: 'pending', notes: null,
    statusHistory: [{ status: 'pending', at: new Date().toISOString() }],
    createdAt: new Date().toISOString()
  };
}

describe('ApplicationService', () => {
  let http: HttpTestingController;
  let onlineSubject: BehaviorSubject<boolean>;
  let userSubject: BehaviorSubject<any>;

  function createService(loggedIn = true): ApplicationService {
    TestBed.resetTestingModule();
    onlineSubject = new BehaviorSubject<boolean>(true);
    userSubject = new BehaviorSubject<any>(loggedIn ? { id: 'u1' } : null);
    TestBed.configureTestingModule({
      providers: [
        ApplicationService,
        StorageService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            currentUser$: userSubject.asObservable(),
            get isLoggedIn() { return userSubject.value !== null; }
          }
        },
        {
          provide: PwaService,
          useValue: {
            isOnline$: onlineSubject.asObservable(),
            get isOnline() { return onlineSubject.value; }
          }
        }
      ]
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(ApplicationService);
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('loads applications on login', () => {
    const service = createService();
    const req = http.expectOne(`${environment.apiUrl}/applications`);
    req.flush([serverApp('app_1', 'https://a/1')]);
    expect(service.getApplications().length).toBe(1);
    expect(service.hasApplied('https://a/1')).toBeTrue();
  });

  it('rejects unauthenticated applies without a request', () => {
    const service = createService(false);
    let error: any;
    service.applyToJob(makeJob('https://a/1')).subscribe({ error: e => (error = e) });
    expect(error.message).toContain('sign in');
    http.expectNone(`${environment.apiUrl}/applications`);
  });

  it('applies and marks the job as applied', () => {
    const service = createService();
    http.expectOne(`${environment.apiUrl}/applications`).flush([]);

    service.applyToJob(makeJob('https://a/2')).subscribe();
    const req = http.expectOne((r) => r.method === 'POST' && r.url === `${environment.apiUrl}/applications`);
    req.flush(serverApp('app_2', 'https://a/2'));

    expect(service.hasApplied('https://a/2')).toBeTrue();
  });

  it('surfaces 409 conflicts as errors', () => {
    const service = createService();
    http.expectOne(`${environment.apiUrl}/applications`).flush([]);

    let error: any;
    service.applyToJob(makeJob('https://a/3')).subscribe({ error: e => (error = e) });
    http.expectOne((r) => r.method === 'POST').flush(
      { detail: 'Already applied' },
      { status: 409, statusText: 'Conflict' }
    );
    expect(error.status).toBe(409);
  });

  it('queues applications while offline and syncs them on reconnect', () => {
    const service = createService();
    http.expectOne(`${environment.apiUrl}/applications`).flush([]);

    onlineSubject.next(false);
    let queued: any;
    service.applyToJob(makeJob('https://a/off')).subscribe(app => (queued = app));
    expect(queued.pendingSync).toBeTrue();
    expect(service.pendingCount).toBe(1);
    expect(service.hasApplied('https://a/off')).toBeTrue();

    onlineSubject.next(true);
    const req = http.expectOne((r) => r.method === 'POST' && r.url === `${environment.apiUrl}/applications`);
    req.flush(serverApp('app_4', 'https://a/off'));
    // After the outbox drains it reloads from the server.
    http.expectOne(`${environment.apiUrl}/applications`).flush([serverApp('app_4', 'https://a/off')]);

    expect(service.pendingCount).toBe(0);
    expect(service.getApplications()[0].pendingSync).toBeFalse();
  });

  it('treats a 409 during outbox sync as already-applied', () => {
    const service = createService();
    http.expectOne(`${environment.apiUrl}/applications`).flush([]);

    onlineSubject.next(false);
    service.applyToJob(makeJob('https://a/dup')).subscribe();
    expect(service.pendingCount).toBe(1);

    onlineSubject.next(true);
    http.expectOne((r) => r.method === 'POST').flush(
      { detail: 'Already applied' },
      { status: 409, statusText: 'Conflict' }
    );
    http.expectOne(`${environment.apiUrl}/applications`).flush([serverApp('app_5', 'https://a/dup')]);

    expect(service.pendingCount).toBe(0);
    expect(service.hasApplied('https://a/dup')).toBeTrue();
  });

  it('keeps the queue when the sync hits a network failure', () => {
    const service = createService();
    http.expectOne(`${environment.apiUrl}/applications`).flush([]);

    onlineSubject.next(false);
    service.applyToJob(makeJob('https://a/fail')).subscribe();

    onlineSubject.next(true);
    http.expectOne((r) => r.method === 'POST').error(new ProgressEvent('error'));

    expect(service.pendingCount).toBe(1);
  });

  it('updates status through PATCH', () => {
    const service = createService();
    http.expectOne(`${environment.apiUrl}/applications`).flush([serverApp('app_1', 'https://a/1')]);

    service.updateStatus('app_1', ApplicationStatus.InterviewInvited).subscribe();
    const req = http.expectOne(`${environment.apiUrl}/applications/app_1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'interview' });
    req.flush({ ...serverApp('app_1', 'https://a/1'), status: 'interview' });

    expect(service.getApplications()[0].status).toBe(ApplicationStatus.InterviewInvited);
  });

  it('updates notes through PATCH', () => {
    const service = createService();
    http.expectOne(`${environment.apiUrl}/applications`).flush([serverApp('app_1', 'https://a/1')]);

    service.updateNotes('app_1', 'call Friday').subscribe();
    const req = http.expectOne(`${environment.apiUrl}/applications/app_1`);
    expect(req.request.body).toEqual({ notes: 'call Friday' });
    req.flush({ ...serverApp('app_1', 'https://a/1'), notes: 'call Friday' });

    expect(service.getApplications()[0].notes).toBe('call Friday');
  });

  it('removeApplication frees the job for re-applying', () => {
    const service = createService();
    http.expectOne(`${environment.apiUrl}/applications`).flush([serverApp('app_1', 'https://a/1')]);
    expect(service.hasApplied('https://a/1')).toBeTrue();

    service.removeApplication('app_1').subscribe();
    http.expectOne((r) => r.method === 'DELETE').flush({});

    expect(service.hasApplied('https://a/1')).toBeFalse();
    expect(service.getApplications().length).toBe(0);
  });
});
