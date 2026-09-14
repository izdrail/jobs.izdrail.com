import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { AuthService } from '../../core/services/auth.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { ProfileService, UserProfile, MAX_RESUME_BYTES } from '../../core/services/profile.service';
import { JobService } from '../../core/services/job.service';
import { BillingNotConfiguredError } from '../../core/services/billing.service';
import { SubscriptionStatus } from '../../core/models/user.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-settings',
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
  standalone: false,
})
export class SettingsPage implements OnInit, OnDestroy {
  isLoggedIn = false;
  subscriptionStatus: SubscriptionStatus = SubscriptionStatus.None;
  trialDaysRemaining = 0;
  purchasing = false;
  restoring = false;

  profile: UserProfile | null = null;
  skillsInput = '';
  savingProfile = false;
  uploadingResume = false;

  readonly remoteOptions = [
    { value: 'any', label: 'Any' },
    { value: 'remote', label: 'Remote' },
    { value: 'hybrid', label: 'Hybrid' },
    { value: 'onsite', label: 'On-site' }
  ];

  private subs: Subscription[] = [];

  constructor(
    private authService: AuthService,
    private subscriptionService: SubscriptionService,
    private profileService: ProfileService,
    private jobService: JobService,
    private alertController: AlertController,
    private toastController: ToastController,
    private router: Router
  ) {}

  ngOnInit() {
    this.isLoggedIn = this.authService.isLoggedIn;

    this.subs.push(
      this.authService.currentUser$.subscribe(user => {
        this.isLoggedIn = !!user;
        if (user) {
          this.loadProfile();
        } else {
          this.profile = null;
        }
      }),
      this.subscriptionService.status$.subscribe(status => {
        this.subscriptionStatus = status;
        this.trialDaysRemaining = this.subscriptionService.getTrialDaysRemaining();
      })
    );
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
  }

  getSubscriptionLabel(): string {
    return this.subscriptionService.getStatusLabel();
  }

  goToLogin() {
    this.router.navigate(['/auth'], { queryParams: { mode: 'signup' } });
  }

  async purchaseSubscription() {
    this.purchasing = true;

    this.subscriptionService.purchaseSubscription('jobswipe_monthly').subscribe({
      next: async () => {
        this.purchasing = false;
        const toast = await this.toastController.create({
          message: 'Subscription activated! You can now apply to jobs.',
          duration: 3000,
          color: 'success',
          position: 'bottom',
          icon: 'checkmark-circle'
        });
        await toast.present();
      },
      error: async (err) => {
        this.purchasing = false;
        if (err instanceof BillingNotConfiguredError) {
          const alert = await this.alertController.create({
            header: 'Purchases unavailable',
            message: 'In-app purchases are not configured for this build yet. Please try again later or contact support@izdrail.com.',
            buttons: ['OK']
          });
          await alert.present();
          return;
        }
        const toast = await this.toastController.create({
          message: err?.error?.detail || 'Purchase failed. Please try again.',
          duration: 3000,
          color: 'danger',
          position: 'bottom'
        });
        await toast.present();
      }
    });
  }

  async restorePurchases() {
    this.restoring = true;
    this.subscriptionService.restorePurchases().subscribe({
      next: async () => {
        this.restoring = false;
        const toast = await this.toastController.create({
          message: 'Purchases restored successfully.',
          duration: 2000,
          color: 'success',
          position: 'bottom'
        });
        await toast.present();
      },
      error: async (err) => {
        this.restoring = false;
        const message = err instanceof BillingNotConfiguredError
          ? 'In-app purchases are not configured for this build yet.'
          : (err?.error?.detail || err?.message || 'Could not restore purchases.');
        const toast = await this.toastController.create({
          message,
          duration: 3000,
          color: 'danger',
          position: 'bottom'
        });
        await toast.present();
      }
    });
  }

  // --- Profile -------------------------------------------------------------

  private loadProfile() {
    this.profileService.getProfile().subscribe({
      next: profile => {
        this.profile = profile;
        this.skillsInput = profile.skills.join(', ');
      },
      error: () => { /* profile stays null; section hides itself */ }
    });
  }

  saveProfile() {
    if (!this.profile || this.savingProfile) {
      return;
    }
    this.savingProfile = true;
    const skills = this.skillsInput
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .slice(0, 50);

    this.profileService.updateProfile({
      skills,
      desired_role: this.profile.desiredRole || '',
      location: this.profile.location || '',
      remote_preference: this.profile.remotePreference || 'any'
    }).subscribe({
      next: profile => {
        this.savingProfile = false;
        this.profile = profile;
        this.skillsInput = profile.skills.join(', ');
        this.showToast('Profile saved', 'success');
      },
      error: err => {
        this.savingProfile = false;
        this.showToast(err?.error?.detail || 'Could not save the profile.', 'danger');
      }
    });
  }

  onResumeSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.uploadingResume) {
      return;
    }

    const validationError = this.profileService.validateResumeFile(file);
    if (validationError) {
      this.showToast(validationError, 'warning');
      return;
    }

    this.uploadingResume = true;
    this.profileService.uploadResume(file).subscribe({
      next: profile => {
        this.uploadingResume = false;
        this.profile = profile;
        this.showToast('Resume uploaded', 'success');
      },
      error: err => {
        this.uploadingResume = false;
        this.showToast(err?.error?.detail || 'Could not upload the resume.', 'danger');
      }
    });
  }

  async deleteResume() {
    const alert = await this.alertController.create({
      header: 'Delete Resume',
      message: 'Remove your uploaded resume?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            this.profileService.deleteResume().subscribe({
              next: () => {
                if (this.profile) {
                  this.profile = { ...this.profile, resume: null };
                }
                this.showToast('Resume deleted', 'medium');
              },
              error: () => this.showToast('Could not delete the resume.', 'danger')
            });
          }
        }
      ]
    });
    await alert.present();
  }

  formatResumeSize(bytes: number): string {
    if (bytes >= MAX_RESUME_BYTES) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  // --- Account -------------------------------------------------------------

  async logout() {
    const alert = await this.alertController.create({
      header: 'Log Out',
      message: 'Are you sure you want to log out?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Log Out',
          role: 'destructive',
          handler: () => {
            this.authService.logout();
            this.router.navigateByUrl('/home');
            this.showToast('Logged out successfully', 'medium');
          }
        }
      ]
    });
    await alert.present();
  }

  async clearLocalData() {
    const alert = await this.alertController.create({
      header: 'Clear Local Data',
      message: 'This removes the cached job list and queued offline applications from this device. Applications already synced to your account are not affected.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Clear',
          role: 'destructive',
          handler: () => {
            this.jobService.clearCache();
            this.showToast('Local data cleared', 'medium');
          }
        }
      ]
    });
    await alert.present();
  }

  async showToast(message: string, color: string = 'medium') {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      color,
      position: 'bottom'
    });
    await toast.present();
  }
}
