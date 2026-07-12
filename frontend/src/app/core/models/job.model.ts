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

export interface JobApplication {
  id: string;
  job: Job;
  appliedAt: Date;
  status: ApplicationStatus;
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
