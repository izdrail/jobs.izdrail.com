import { Component, NgZone, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { MenuController, Platform, ToastController } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { AuthService } from './core/services/auth.service';
import { UserService } from './core/services/user.service';
import { SubscriptionService } from './core/services/subscription.service';
import { SubscriptionStatus } from './core/models/user.model';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  isLoggedIn$!: Observable<boolean>;
  displayName$!: Observable<string>;
  subscriptionStatus$!: Observable<SubscriptionStatus>;

  menuItems = [
    { title: 'Job Cards', url: '/home', icon: 'albums-outline', activeIcon: 'albums', requiresAuth: false },
    { title: 'My Applications', url: '/my-applications', icon: 'document-text-outline', activeIcon: 'document-text', requiresAuth: true },
    { title: 'Settings', url: '/settings', icon: 'settings-outline', activeIcon: 'settings', requiresAuth: false },
    { title: 'About', url: '/about', icon: 'information-circle-outline', activeIcon: 'information-circle', requiresAuth: false },
  ];

  constructor(
    private router: Router,
    private location: Location,
    private menu: MenuController,
    private platform: Platform,
    private zone: NgZone,
    private authService: AuthService,
    public userService: UserService,
    private subscriptionService: SubscriptionService,
    private toastController: ToastController
  ) {
    this.isLoggedIn$ = this.authService.isLoggedIn$;
    this.displayName$ = this.userService.displayName$;
    this.subscriptionStatus$ = this.subscriptionService.status$;
  }

  async ngOnInit() {
    try {
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#121212' });
    } catch {
      // running in browser
    }

    try {
      await SplashScreen.hide();
    } catch {
      // running in browser
    }

    if (Capacitor.isNativePlatform()) {
      this.setupAndroidBackButton();
      this.setupDeepLinks();
    }
  }

  /**
   * Hardware back button: Ionic overlays (modals, alerts, menus) register at
   * higher priority and close themselves first. On the root page we exit;
   * anywhere else we navigate back instead of dropping out of the app.
   */
  private setupAndroidBackButton() {
    this.platform.backButton.subscribeWithPriority(5, async () => {
      const menuOpen = await this.menu.isOpen();
      if (menuOpen) {
        await this.menu.close();
        return;
      }
      const path = this.router.url.split('?')[0];
      if (path === '/home' || path === '/' || path === '/auth') {
        await App.exitApp();
      } else {
        this.location.back();
      }
    });
  }

  /** Route job deep links (e.g. https://jobs.izdrail.com/job/<url>) into the app. */
  private setupDeepLinks() {
    App.addListener('appUrlOpen', ({ url }) => {
      const match = url.match(/\/job\/([^?#]+)/);
      if (match) {
        this.zone.run(() => {
          this.router.navigate(['/job', match[1]]);
        });
        return;
      }
      const pathMatch = url.match(/\/(home|my-applications|settings|about|auth)(?:[?#]|$)/);
      if (pathMatch) {
        this.zone.run(() => {
          this.router.navigate(['/' + pathMatch[1]]);
        });
      }
    });
  }

  navigateTo(url: string) {
    this.router.navigateByUrl(url);
    this.menu.close();
  }

  navigateToAuth(mode: 'login' | 'signup') {
    this.router.navigate(['/auth'], { queryParams: { mode, returnUrl: this.router.url } });
    this.menu.close();
  }

  async logout() {
    this.authService.logout();
    this.menu.close();
    const toast = await this.toastController.create({
      message: 'Logged out successfully',
      duration: 2000,
      color: 'medium',
      position: 'bottom'
    });
    await toast.present();
    this.router.navigateByUrl('/home');
  }

  isActive(url: string): boolean {
    return this.router.url === url || this.router.url.startsWith(url + '/');
  }
}
