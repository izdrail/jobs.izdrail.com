import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController, LoadingController, MenuController, AlertController } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { JobService } from '../../core/services/job.service';
import { ApplicationService } from '../../core/services/application.service';
import { AuthService } from '../../core/services/auth.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { SwipeTrackingService } from '../../core/services/swipe-tracking.service';
import { PwaService } from '../../core/services/pwa.service';
import { Job, JobFilters, DEFAULT_JOB_FILTERS } from '../../core/models/job.model';
import { Subscription } from 'rxjs';

interface CardState {
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  likeOpacity: number;
  nopeOpacity: number;
}

interface LastSwipe {
  job: Job;
  direction: 'left' | 'right';
  applicationId: string | null;
  pendingSync: boolean;
}

const DEFAULT_KEYWORD = 'software developer';
const PAGE_SIZE = 20;

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit, OnDestroy {
  jobs: Job[] = [];
  loading = true;
  loadingMore = false;
  applying = false;
  noMoreJobs = false;
  loadError: string | null = null;
  isOnline = true;
  pendingSyncCount = 0;

  keyword = '';
  filters: JobFilters = { ...DEFAULT_JOB_FILTERS };
  technologiesInput = '';
  filtersOpen = false;

  readonly jobTypeOptions = ['Full-time', 'Part-time', 'Contract', 'Internship'];
  readonly siteOptions = [
    'indeed', 'linkedin', 'glassdoor', 'the_guardian',
    'cv_library', 'builtin', 'findwork', 'jobicy'
  ];
  readonly datePostedOptions = [
    { label: 'Any time', value: null },
    { label: 'Past 24 hours', value: 1 },
    { label: 'Past week', value: 7 },
    { label: 'Past month', value: 30 }
  ];

  private page = 1;
  private hasMore = false;
  private touchStartX = 0;
  private touchStartY = 0;
  private isDragging = false;
  currentIndex = 0;
  private subscriptions: Subscription[] = [];
  private lastSwipe: LastSwipe | null = null;

  cardStates: CardState[] = [];

  readonly SWIPE_THRESHOLD = 100;
  readonly MAX_VISIBLE = 3;

  constructor(
    private jobService: JobService,
    private applicationService: ApplicationService,
    private authService: AuthService,
    private subscriptionService: SubscriptionService,
    private swipeTrackingService: SwipeTrackingService,
    private pwaService: PwaService,
    private toastController: ToastController,
    private loadingController: LoadingController,
    private alertController: AlertController,
    private router: Router,
    private menu: MenuController
  ) {}

  ngOnInit() {
    const saved = this.jobService.loadFilters();
    this.filters = saved.filters;
    this.keyword = saved.keyword;
    this.technologiesInput = this.filters.technologies.join(', ');

    this.subscriptions.push(
      this.pwaService.isOnline$.subscribe(online => {
        this.isOnline = online;
      }),
      this.applicationService.applications$.subscribe(() => {
        this.pendingSyncCount = this.applicationService.pendingCount;
      })
    );

    this.search();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(s => s.unsubscribe());
  }

  /** Start a fresh search (page 1) with the current keyword and filters. */
  search() {
    this.page = 1;
    this.hasMore = false;
    this.currentIndex = 0;
    this.jobs = [];
    this.noMoreJobs = false;
    this.loadError = null;
    this.loading = true;

    this.jobService.saveFilters(this.filters, this.keyword);

    const sub = this.jobService.searchJobs({
      keyword: this.keyword || DEFAULT_KEYWORD,
      filters: this.filters,
      page: this.page,
      pageSize: PAGE_SIZE
    }).subscribe({
      next: (result) => {
        if (result.stale) {
          return;
        }
        this.loading = false;
        this.hasMore = result.has_more;
        this.jobService.mergeIntoCache(result.data);
        this.jobs = this.dedupe(result.data)
          .filter(j => !this.applicationService.hasApplied(j.job_url));
        this.initCardStates();
        if (this.jobs.length === 0 && !this.hasMore) {
          this.noMoreJobs = true;
        }
      },
      error: () => {
        this.loading = false;
        this.loadError = 'Could not load jobs. Check your connection and try again.';
        if (this.jobs.length === 0) {
          this.noMoreJobs = true;
        }
      }
    });
    this.subscriptions.push(sub);
  }

  /** Infinite scroll: fetch the next page of the current search. */
  loadNextPage(event?: { target: { complete: () => void; disabled: boolean } }) {
    if (!this.hasMore || this.loading || this.loadingMore) {
      event?.target.complete();
      return;
    }
    this.loadingMore = true;
    this.page += 1;

    const sub = this.jobService.searchJobs({
      keyword: this.keyword || DEFAULT_KEYWORD,
      filters: this.filters,
      page: this.page,
      pageSize: PAGE_SIZE
    }).subscribe({
      next: (result) => {
        this.loadingMore = false;
        event?.target.complete();
        if (result.stale) {
          return;
        }
        this.hasMore = result.has_more;
        this.jobService.mergeIntoCache(result.data);
        const fresh = this.dedupe(result.data)
          .filter(j => !this.applicationService.hasApplied(j.job_url))
          .filter(j => !this.jobs.some(existing => existing.job_url === j.job_url));
        this.jobs = [...this.jobs, ...fresh];
        this.initCardStates();
        if (!this.hasMore) {
          event && (event.target.disabled = true);
        }
      },
      error: () => {
        this.loadingMore = false;
        this.page -= 1;
        event?.target.complete();
        this.showToast('Could not load more jobs. Try again.', 'danger');
      }
    });
    this.subscriptions.push(sub);
  }

  applyFilters() {
    this.filters.technologies = this.technologiesInput
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0)
      .slice(0, 10);
    this.filtersOpen = false;
    this.search();
  }

  resetFilters() {
    this.filters = { ...DEFAULT_JOB_FILTERS };
    this.technologiesInput = '';
  }

  get hasActiveFilters(): boolean {
    return this.filters.isRemote !== null
      || !!this.filters.jobType
      || this.filters.minSalary !== null
      || this.filters.maxSalary !== null
      || this.filters.datePostedWithinDays !== null
      || !!this.filters.site
      || this.filters.technologies.length > 0;
  }

  private dedupe(jobs: Job[]): Job[] {
    const seen = new Set<string>();
    return jobs.filter(j => {
      if (seen.has(j.job_url)) {
        return false;
      }
      seen.add(j.job_url);
      return true;
    });
  }

  initCardStates() {
    this.cardStates = this.jobs.map((_, i) => this.cardStates[i] || {
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 1,
      likeOpacity: 0,
      nopeOpacity: 0
    });
  }

  get visibleJobs(): Job[] {
    return this.jobs.slice(this.currentIndex, this.currentIndex + this.MAX_VISIBLE);
  }

  getTopCardIndex(): number {
    return this.currentIndex;
  }

  getCardStyle(index: number): Record<string, string | number> {
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
    this.triggerHaptics(direction);

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
      this.lastSwipe = { job, direction, applicationId: null, pendingSync: false };
      this.animateAndAdvance(index, direction);
      this.showUndoToast(`Skipped ${job.company || job.title}`);
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
      this.maybePrefetchMore();
    }, 300);
  }

  /** Keep the deck fed: fetch the next page when the end is in sight. */
  private maybePrefetchMore() {
    if (this.currentIndex >= this.jobs.length) {
      if (this.hasMore) {
        this.loadNextPage();
      } else {
        this.noMoreJobs = true;
      }
    } else if (this.jobs.length - this.currentIndex <= 3 && this.hasMore) {
      this.loadNextPage();
    }
  }

  async applyToJob(job: Job, index: number) {
    this.applying = true;

    const sub = this.applicationService.applyToJob(job).subscribe({
      next: async (application) => {
        this.applying = false;
        this.lastSwipe = {
          job,
          direction: 'right',
          applicationId: application.id,
          pendingSync: application.pendingSync
        };
        this.animateAndAdvance(index, 'right');
        this.showUndoToast(
          application.pendingSync
            ? `Queued application to ${job.company || job.title} (syncs when back online)`
            : `Applied to ${job.company || job.title}!`
        );
      },
      error: async (err) => {
        this.applying = false;
        const toast = await this.toastController.create({
          message: err.error?.detail || err.message || 'Failed to apply. Please try again.',
          duration: 3000,
          color: 'danger',
          position: 'bottom'
        });
        await toast.present();
      }
    });
    this.subscriptions.push(sub);
  }

  private async showUndoToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 5000,
      color: 'success',
      position: 'bottom',
      icon: 'checkmark-circle',
      buttons: [
        {
          text: 'Undo',
          role: 'cancel',
          handler: () => {
            this.undoLastSwipe();
          }
        }
      ]
    });
    await toast.present();
  }

  /**
   * Undo the last swipe. Honest server semantics: a queued (offline)
   * application is removed from the outbox, a synced one is deleted through
   * the API, and the swipe telemetry record is removed best-effort.
   */
  undoLastSwipe() {
    const last = this.lastSwipe;
    if (!last) {
      return;
    }
    this.lastSwipe = null;

    if (last.direction === 'right' && last.applicationId) {
      if (last.pendingSync) {
        this.applicationService.removePending(last.applicationId);
      } else {
        this.applicationService.removeApplication(last.applicationId).subscribe({
          error: () => this.showToast('Could not undo the application.', 'danger')
        });
      }
    } else if (last.direction === 'left') {
      this.swipeTrackingService.undoLastSwipe(last.job.job_url).subscribe({
        error: () => { /* best-effort telemetry */ }
      });
    }

    this.restoreCard(last.job);
  }

  private restoreCard(job: Job) {
    if (this.currentIndex > 0 && this.jobs[this.currentIndex - 1]?.job_url === job.job_url) {
      this.currentIndex--;
      this.cardStates[this.currentIndex] = {
        x: 0, y: 0, rotation: 0, opacity: 1, likeOpacity: 0, nopeOpacity: 0
      };
      this.noMoreJobs = false;
    }
  }

  private triggerHaptics(direction: 'left' | 'right') {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    Haptics.impact({
      style: direction === 'right' ? ImpactStyle.Medium : ImpactStyle.Light
    }).catch(() => { /* haptics unavailable */ });
  }

  async openJobDetails(job: Job) {
    this.router.navigate(['/job', encodeURIComponent(job.job_url)]);
  }

  doRefresh(event: { target: { complete: () => void } }) {
    this.currentIndex = 0;
    this.search();
    setTimeout(() => {
      event.target.complete();
    }, 1500);
  }

  private async showToast(message: string, color: string) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom'
    });
    await toast.present();
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
