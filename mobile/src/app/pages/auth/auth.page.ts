import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { AuthService } from '../../core/services/auth.service';
import { SubscriptionService } from '../../core/services/subscription.service';

@Component({
  selector: 'app-auth',
  templateUrl: './auth.page.html',
  styleUrls: ['./auth.page.scss'],
  standalone: false,
})
export class AuthPage implements OnInit {
  mode: 'login' | 'signup' = 'signup';
  email = '';
  password = '';
  displayName = '';
  loading = false;
  returnUrl = '/home';

  constructor(
    private authService: AuthService,
    private subscriptionService: SubscriptionService,
    private router: Router,
    private route: ActivatedRoute,
    private toastController: ToastController
  ) {}

  ngOnInit() {
    if (this.route.snapshot.queryParams['returnUrl']) {
      this.returnUrl = this.route.snapshot.queryParams['returnUrl'];
    }
    if (this.route.snapshot.queryParams['mode']) {
      this.mode = this.route.snapshot.queryParams['mode'] as 'login' | 'signup';
    }
  }

  switchMode() {
    this.mode = this.mode === 'login' ? 'signup' : 'login';
    this.email = '';
    this.password = '';
    this.displayName = '';
  }

  async submit() {
    if (!this.email || !this.password) {
      const toast = await this.toastController.create({
        message: 'Please fill in all required fields',
        duration: 2000,
        color: 'warning',
        position: 'bottom'
      });
      await toast.present();
      return;
    }

    if (this.mode === 'signup' && !this.isValidEmail(this.email)) {
      const toast = await this.toastController.create({
        message: 'Please enter a valid email address',
        duration: 2000,
        color: 'warning',
        position: 'bottom'
      });
      await toast.present();
      return;
    }

    if (this.password.length < 6) {
      const toast = await this.toastController.create({
        message: 'Password must be at least 6 characters',
        duration: 2000,
        color: 'warning',
        position: 'bottom'
      });
      await toast.present();
      return;
    }

    this.loading = true;

    if (this.mode === 'signup') {
      this.authService.signUp(this.email, this.password, this.displayName).subscribe({
        next: async () => {
          this.subscriptionService.startTrial();
          this.loading = false;
          const toast = await this.toastController.create({
            message: 'Account created! 3-day free trial started.',
            duration: 3000,
            color: 'success',
            position: 'bottom',
            icon: 'checkmark-circle'
          });
          await toast.present();
          this.router.navigateByUrl(this.returnUrl);
        },
        error: async (err) => {
          this.loading = false;
          const toast = await this.toastController.create({
            message: err.message || 'Sign up failed. Please try again.',
            duration: 3000,
            color: 'danger',
            position: 'bottom'
          });
          await toast.present();
        }
      });
    } else {
      this.authService.login(this.email, this.password).subscribe({
        next: async () => {
          this.loading = false;
          const toast = await this.toastController.create({
            message: 'Welcome back!',
            duration: 2000,
            color: 'success',
            position: 'bottom',
            icon: 'checkmark-circle'
          });
          await toast.present();
          this.router.navigateByUrl(this.returnUrl);
        },
        error: async (err) => {
          this.loading = false;
          const toast = await this.toastController.create({
            message: err.message || 'Login failed. Please try again.',
            duration: 3000,
            color: 'danger',
            position: 'bottom'
          });
          await toast.present();
        }
      });
    }
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
