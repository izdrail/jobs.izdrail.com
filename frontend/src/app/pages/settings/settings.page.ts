import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { AuthService } from '../../core/services/auth.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { SubscriptionStatus } from '../../core/models/user.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-settings',
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
  standalone: false,
})
export class SettingsPage implements OnInit, OnDestroy {
  notifications = true;
  darkMode = true;
  isLoggedIn = false;
  subscriptionStatus: SubscriptionStatus = SubscriptionStatus.None;
  trialDaysRemaining = 0;
  purchasing = false;
  private subs: Subscription[] = [];

  constructor(
    private authService: AuthService,
    private subscriptionService: SubscriptionService,
    private alertController: AlertController,
    private toastController: ToastController,
    private router: Router
  ) {}

  ngOnInit() {
    this.isLoggedIn = this.authService.isLoggedIn;

    this.subs.push(
      this.authService.currentUser$.subscribe(user => {
        this.isLoggedIn = !!user;
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
      error: async () => {
        this.purchasing = false;
        const toast = await this.toastController.create({
          message: 'Purchase failed. Please try again.',
          duration: 3000,
          color: 'danger',
          position: 'bottom'
        });
        await toast.present();
      }
    });
  }

  async restorePurchases() {
    this.subscriptionService.restorePurchases().subscribe({
      next: async () => {
        const toast = await this.toastController.create({
          message: 'Purchases restored successfully.',
          duration: 2000,
          color: 'success',
          position: 'bottom'
        });
        await toast.present();
      },
      error: async () => {
        const toast = await this.toastController.create({
          message: 'Could not restore purchases.',
          duration: 3000,
          color: 'danger',
          position: 'bottom'
        });
        await toast.present();
      }
    });
  }

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
            this.showToast('Logged out successfully');
          }
        }
      ]
    });
    await alert.present();
  }

  async clearApplications() {
    const alert = await this.alertController.create({
      header: 'Clear All Data',
      message: 'This will remove all your job applications. This action cannot be undone.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Clear',
          role: 'destructive',
          handler: () => {
            localStorage.removeItem('jobswipe_applications');
            this.showToast('All application data cleared');
          }
        }
      ]
    });
    await alert.present();
  }

  async showToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      color: 'medium',
      position: 'bottom'
    });
    await toast.present();
  }
}
