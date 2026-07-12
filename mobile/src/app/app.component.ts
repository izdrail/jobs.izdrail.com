import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { MenuController, ToastController } from '@ionic/angular';
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
export class AppComponent {
  isLoggedIn$!: Observable<boolean>;
  displayName$!: Observable<string>;
  subscriptionStatus$!: Observable<SubscriptionStatus>;

  menuItems = [
    { title: 'Job Cards', url: '/home', icon: 'albums-outline', activeIcon: 'albums' },
    { title: 'My Applications', url: '/my-applications', icon: 'document-text-outline', activeIcon: 'document-text', requiresAuth: true },
    { title: 'Settings', url: '/settings', icon: 'settings-outline', activeIcon: 'settings' },
    { title: 'About', url: '/about', icon: 'information-circle-outline', activeIcon: 'information-circle' },
  ];

  constructor(
    private router: Router,
    private menu: MenuController,
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
