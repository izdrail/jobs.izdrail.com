export interface Job {
  site: string;
  job_url: string;
  job_url_direct: string | null;
  title: string;
  company: string | null;
  location: string;
  job_type: string | null;
  date_posted: string | null;
  interval: string | null;
  min_amount: number | null;
  max_amount: number | null;
  currency: string | null;
  is_remote: boolean | null;
  emails: string | null;
  description: string;
  company_url: string | null;
  company_url_direct: string | null;
  company_addresses: string | null;
  company_industry: string | null;
  company_num_employees: string | null;
  company_revenue: string | null;
  company_description: string | null;
  logo_photo_url: string | null;
  banner_photo_url: string | null;
  ceo_name: string | null;
  ceo_photo_url: string | null;
}

export interface JobSearchResponse {
  data: Job[];
}

export interface JobSearchRequest {
  keyword: string;
}

export interface JobFilters {
  isRemote: boolean | null;
  jobType: string | null;
  minSalary: number | null;
  maxSalary: number | null;
  datePostedWithinDays: number | null;
  site: string | null;
  technologies: string[];
}

export const DEFAULT_JOB_FILTERS: JobFilters = {
  isRemote: null,
  jobType: null,
  minSalary: null,
  maxSalary: null,
  datePostedWithinDays: null,
  site: null,
  technologies: []
};

export interface JobSearchQuery {
  keyword: string;
  filters?: Partial<JobFilters>;
  page?: number;
  pageSize?: number;
}

export interface JobSearchPage {
  data: Job[];
  page: number;
  page_size: number;
  total: number;
  has_more: boolean;
  /** True when a newer search superseded this response; callers must ignore it. */
  stale?: boolean;
}

export interface StatusHistoryEntry {
  status: string;
  at: string;
}

export interface JobApplication {
  id: string;
  job: Job;
  appliedAt: Date;
  status: ApplicationStatus;
  notes: string | null;
  statusHistory: StatusHistoryEntry[];
  /** True while the application is queued locally waiting for connectivity. */
  pendingSync: boolean;
}

export enum ApplicationStatus {
  Pending = 'pending',
  Viewed = 'viewed',
  InterviewInvited = 'interview',
  Rejected = 'rejected',
  OfferReceived = 'offer'
}

export interface SwipeAction {
  job: Job;
  direction: 'left' | 'right';
}
