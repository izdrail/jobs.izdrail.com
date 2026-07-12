import { Component, OnInit, OnDestroy, ViewChild, ElementRef, QueryList } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController, LoadingController, MenuController, AlertController } from '@ionic/angular';
import { JobService } from '../../core/services/job.service';
import { ApplicationService } from '../../core/services/application.service';
import { AuthService } from '../../core/services/auth.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { SwipeTrackingService } from '../../core/services/swipe-tracking.service';
import { Job } from '../../core/models/job.model';
import { Subscription } from 'rxjs';

interface CardState {
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  likeOpacity: number;
  nopeOpacity: number;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit, OnDestroy {
  jobs: Job[] = [];
  loading = true;
  applying = false;
  noMoreJobs = false;

  private touchStartX = 0;
  private touchStartY = 0;
  private isDragging = false;
  currentIndex = 0;
  private subscriptions: Subscription[] = [];

  cardStates: CardState[] = [];

  readonly SWIPE_THRESHOLD = 100;
  readonly MAX_VISIBLE = 3;

  constructor(
    private jobService: JobService,
    private applicationService: ApplicationService,
    private authService: AuthService,
    private subscriptionService: SubscriptionService,
    private swipeTrackingService: SwipeTrackingService,
    private toastController: ToastController,
    private loadingController: LoadingController,
    private alertController: AlertController,
    private router: Router,
    private menu: MenuController
  ) {}

  ngOnInit() {
    if (this.jobService.hasCachedJobs()) {
      this.jobs = this.jobService.getCachedJobs()
        .filter(j => !this.applicationService.hasApplied(j.job_url));
      this.initCardStates();
      this.loading = false;
      this.loadJobs(true);
    } else {
      this.loadJobs(false);
    }
  }

  ngOnDestroy() {
    this.subscriptions.forEach(s => s.unsubscribe());
  }

  async loadJobs(silent = false) {
    if (!silent) {
      this.loading = true;
    }
    this.noMoreJobs = false;

    const sub = this.jobService.loadJobs().subscribe({
      next: (jobs) => {
        this.jobs = jobs.filter(j => !this.applicationService.hasApplied(j.job_url));
        this.initCardStates();
        this.loading = false;
        if (this.jobs.length === 0) {
          this.noMoreJobs = true;
        }
      },
      error: async () => {
        this.loading = false;
        if (this.jobs.length === 0) {
          this.noMoreJobs = true;
        }
        if (!silent) {
          const toast = await this.toastController.create({
            message: 'Failed to load jobs. Pull down to retry.',
            duration: 3000,
            color: 'danger',
            position: 'bottom'
          });
          await toast.present();
        }
      }
    });
    this.subscriptions.push(sub);
  }

  initCardStates() {
    this.cardStates = this.jobs.map(() => ({
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 1,
      likeOpacity: 0,
      nopeOpacity: 0
    }));
  }

  get visibleJobs(): Job[] {
    return this.jobs.slice(this.currentIndex, this.currentIndex + this.MAX_VISIBLE);
  }

  getTopCardIndex(): number {
    return this.currentIndex;
  }

  getCardStyle(index: number): any {
    const visibleIndex = index - this.currentIndex;
    const state = this.cardStates[index];
    if (!state) return {};

    if (visibleIndex === 0) {
      return {
        'transform': `translate(${state.x}px, ${state.y}px) rotate(${state.rotation}deg)`,
        'transition': this.isDragging ? 'none' : 'transform 0.4s ease, opacity 0.3s ease'
      };
    }

    const stackOffset = visibleIndex * 6;
    const scale = 1 - (visibleIndex * 0.04);
    return {
      'transform': `translateY(${stackOffset}px) scale(${scale})`,
      'z-index': this.MAX_VISIBLE - visibleIndex,
      'opacity': 1 - (visibleIndex * 0.15)
    };
  }

  getLikeOpacity(index: number): number {
    const state = this.cardStates[index];
    return state ? state.likeOpacity : 0;
  }

  getNopeOpacity(index: number): number {
    const state = this.cardStates[index];
    return state ? state.nopeOpacity : 0;
  }

  onPointerDown(event: PointerEvent, index: number) {
    if (index !== this.getTopCardIndex()) return;
    this.isDragging = true;
    this.touchStartX = event.clientX;
    this.touchStartY = event.clientY;

    const el = event.target as HTMLElement;
    el.setPointerCapture(event.pointerId);
  }

  onPointerMove(event: PointerEvent, index: number) {
    if (!this.isDragging || index !== this.getTopCardIndex()) return;

    const deltaX = event.clientX - this.touchStartX;
    const deltaY = (event.clientY - this.touchStartY) * 0.3;
    const rotation = deltaX * 0.1;

    const likeOpacity = Math.min(Math.max(deltaX / this.SWIPE_THRESHOLD, 0), 1);
    const nopeOpacity = Math.min(Math.max(-deltaX / this.SWIPE_THRESHOLD, 0), 1);

    this.cardStates[index] = {
      x: deltaX,
      y: deltaY,
      rotation,
      opacity: 1,
      likeOpacity,
      nopeOpacity
    };
  }

  onPointerUp(event: PointerEvent, index: number) {
    if (!this.isDragging || index !== this.getTopCardIndex()) return;
    this.isDragging = false;

    const state = this.cardStates[index];
    if (Math.abs(state.x) > this.SWIPE_THRESHOLD) {
      const direction = state.x > 0 ? 'right' : 'left';
      this.swipe(direction);
    } else {
      this.cardStates[index] = {
        x: 0, y: 0, rotation: 0, opacity: 1, likeOpacity: 0, nopeOpacity: 0
      };
    }
  }

  async swipe(direction: 'left' | 'right') {
    const index = this.getTopCardIndex();
    if (index >= this.jobs.length || this.applying) return;

    const job = this.jobs[index];

    this.swipeTrackingService.trackSwipe(job.job_url, direction);

    if (direction === 'right') {
      if (!this.authService.isLoggedIn) {
        const toast = await this.toastController.create({
          message: 'Please sign in to apply for jobs',
          duration: 3000,
          color: 'warning',
          position: 'bottom',
          icon: 'log-in-outline'
        });
        await toast.present();
        this.router.navigate(['/auth'], { queryParams: { returnUrl: '/home' } });
        return;
      }

      if (!this.subscriptionService.canApply) {
        this.animateAndAdvance(index, direction);
        const toast = await this.toastController.create({
          message: 'Your trial has expired. Subscribe to continue applying.',
          duration: 3000,
          color: 'warning',
          position: 'bottom',
          icon: 'card-outline'
        });
        await toast.present();
        return;
      }

      await this.applyToJob(job, index);
    } else {
      this.animateAndAdvance(index, direction);
    }
  }

  private animateAndAdvance(index: number, direction: 'left' | 'right') {
    const targetX = direction === 'right' ? 500 : -500;
    this.cardStates[index] = {
      x: targetX,
      y: 0,
      rotation: direction === 'right' ? 30 : -30,
      opacity: 0,
      likeOpacity: direction === 'right' ? 1 : 0,
      nopeOpacity: direction === 'left' ? 1 : 0
    };

    setTimeout(() => {
      this.currentIndex++;
      if (this.currentIndex >= this.jobs.length) {
        this.noMoreJobs = true;
      }
    }, 300);
  }

  async applyToJob(job: Job, index: number) {
    this.applying = true;

    const sub = this.applicationService.applyToJob(job).subscribe({
      next: async () => {
        this.applying = false;
        this.animateAndAdvance(index, 'right');

        const toast = await this.toastController.create({
          message: `Applied to ${job.company || job.title}!`,
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
    this.subscriptions.push(sub);
  }

  async openJobDetails(job: Job) {
    this.router.navigate(['/job', encodeURIComponent(job.job_url)]);
  }

  doRefresh(event: any) {
    this.currentIndex = 0;
    this.loadJobs();
    setTimeout(() => {
      event.target.complete();
    }, 1500);
  }

  getTechnologies(job: Job): string[] {
    return this.jobService.extractTechnologies(job.description);
  }

  getCompanyInitial(job: Job): string {
    return this.jobService.getCompanyInitial(job.company);
  }

  getCompanyColor(job: Job): string {
    return this.jobService.getCompanyColor(job.company);
  }

  formatSalary(job: Job): string {
    return this.jobService.formatSalary(job.min_amount, job.max_amount, job.currency);
  }

  trackByJob(index: number, job: Job): string {
    return job.job_url;
  }
}
