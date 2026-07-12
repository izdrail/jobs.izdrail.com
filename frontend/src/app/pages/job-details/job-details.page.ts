import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController, AlertController } from '@ionic/angular';
import { JobService } from '../../core/services/job.service';
import { ApplicationService } from '../../core/services/application.service';
import { AuthService } from '../../core/services/auth.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { Job } from '../../core/models/job.model';

@Component({
  selector: 'app-job-details',
  templateUrl: './job-details.page.html',
  styleUrls: ['./job-details.page.scss'],
  standalone: false,
})
export class JobDetailsPage implements OnInit {
  job: Job | null = null;
  loading = true;
  applying = false;
  alreadyApplied = false;
  isLoggedIn = false;
  canApply = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private jobService: JobService,
    private applicationService: ApplicationService,
    private authService: AuthService,
    private subscriptionService: SubscriptionService,
    private toastController: ToastController,
    private alertController: AlertController
  ) {}

  ngOnInit() {
    this.isLoggedIn = this.authService.isLoggedIn;
    this.canApply = this.subscriptionService.canApply;

    this.authService.currentUser$.subscribe(user => {
      this.isLoggedIn = !!user;
    });

    this.subscriptionService.status$.subscribe(() => {
      this.canApply = this.subscriptionService.canApply;
    });

    const url = decodeURIComponent(this.route.snapshot.paramMap.get('url') || '');
    if (url) {
      this.loadJob(url);
    }
  }

  async loadJob(url: string) {
    this.loading = true;
    this.jobService.getJobDetails(url).subscribe({
      next: (job) => {
        this.job = job || null;
        if (job) {
          this.alreadyApplied = this.applicationService.hasApplied(job.job_url);
        }
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  async apply() {
    if (!this.job || this.applying) return;

    if (!this.isLoggedIn) {
      this.router.navigate(['/auth'], {
        queryParams: { returnUrl: `/job/${encodeURIComponent(this.job.job_url)}` }
      });
      return;
    }

    if (!this.canApply) {
      const toast = await this.toastController.create({
        message: 'Your subscription has expired. Please renew to continue applying.',
        duration: 3000,
        color: 'warning',
        position: 'bottom',
        icon: 'card-outline'
      });
      await toast.present();
      return;
    }

    this.applying = true;
    this.applicationService.applyToJob(this.job).subscribe({
      next: async () => {
        this.applying = false;
        this.alreadyApplied = true;
        const toast = await this.toastController.create({
          message: `Applied to ${this.job?.company || this.job?.title}!`,
          duration: 2500,
          color: 'success',
          position: 'bottom',
          icon: 'checkmark-circle'
        });
        await toast.present();
      },
      error: async (err) => {
        this.applying = false;
        const toast = await this.toastController.create({
          message: err.message || 'Failed to apply. Please try again.',
          duration: 3000,
          color: 'danger',
          position: 'bottom'
        });
        await toast.present();
      }
    });
  }

  goToLogin() {
    this.router.navigate(['/auth'], {
      queryParams: { returnUrl: `/job/${encodeURIComponent(this.job?.job_url || '')}` }
    });
  }

  openOriginalJob() {
    if (this.job?.job_url) {
      window.open(this.job.job_url, '_blank');
    }
  }

  getTechnologies(): string[] {
    return this.job ? this.jobService.extractTechnologies(this.job.description) : [];
  }

  getCompanyInitial(): string {
    return this.job ? this.jobService.getCompanyInitial(this.job.company) : '?';
  }

  getCompanyColor(): string {
    return this.job ? this.jobService.getCompanyColor(this.job.company) : '#6C63FF';
  }

  formatSalary(): string {
    return this.job ? this.jobService.formatSalary(this.job.min_amount, this.job.max_amount, this.job.currency) : '';
  }

  goBack() {
    this.router.navigate(['/home']);
  }
}
