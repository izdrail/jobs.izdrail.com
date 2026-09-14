import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ResumeMeta {
  originalName: string;
  contentType: string;
  size: number;
}

export interface UserProfile {
  skills: string[];
  desiredRole: string | null;
  location: string | null;
  remotePreference: 'remote' | 'onsite' | 'hybrid' | 'any' | null;
  resume: ResumeMeta | null;
  updatedAt: string | null;
}

export interface ProfileUpdate {
  skills?: string[];
  desired_role?: string;
  location?: string;
  remote_preference?: string;
}

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const ALLOWED_RESUME_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.md'];

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getProfile(): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.apiUrl}/profile`);
  }

  updateProfile(update: ProfileUpdate): Observable<UserProfile> {
    return this.http.put<UserProfile>(`${this.apiUrl}/profile`, update);
  }

  /** Client-side pre-check; the server revalidates type and size. */
  validateResumeFile(file: File): string | null {
    const extension = `.${file.name.split('.').pop()?.toLowerCase() || ''}`;
    if (!ALLOWED_RESUME_EXTENSIONS.includes(extension)) {
      return `Unsupported file type. Allowed: ${ALLOWED_RESUME_EXTENSIONS.join(', ')}`;
    }
    if (file.size > MAX_RESUME_BYTES) {
      return 'File exceeds the 5 MB limit';
    }
    return null;
  }

  uploadResume(file: File): Observable<UserProfile> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<UserProfile>(`${this.apiUrl}/profile/resume`, form);
  }

  deleteResume(): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.apiUrl}/profile/resume`);
  }
}
