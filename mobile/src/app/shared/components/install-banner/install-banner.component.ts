import { Component, OnInit, OnDestroy } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { PwaService } from '../../../core/services/pwa.service';
import { ToastController } from '@ionic/angular';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-install-banner',
  templateUrl: './install-banner.component.html',
  styleUrls: ['./install-banner.component.scss'],
  standalone: false,
})
export class InstallBannerComponent implements OnInit, OnDestroy {
  showBanner = false;
  showUpdateBanner = false;
  isOnline = true;
  isNative = Capacitor.isNativePlatform();

  private subs: Subscription[] = [];

  constructor(
    private pwaService: PwaService,
    private toastController: ToastController
  ) {}

  ngOnInit() {
    this.subs.push(
      this.pwaService.canInstall$.subscribe(canInstall => {
        this.showBanner = canInstall && !this.isNative;
      }),
      this.pwaService.updateAvailable$.subscribe(available => {
        this.showUpdateBanner = available;
      }),
      this.pwaService.isOnline$.subscribe(online => {
        this.isOnline = online;
        if (!online) {
          this.showOfflineToast();
        }
      })
    );
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
  }

  async install() {
    await this.pwaService.installApp();
  }

  dismiss() {
    this.pwaService.dismissInstallPrompt();
  }

  rateUs() {
    window.open('https://play.google.com/store/apps/details?id=io.ionic.jobswipe', '_blank');
  }

  async updateApp() {
    await this.pwaService.applyUpdate();
  }

  private async showOfflineToast() {
    const toast = await this.toastController.create({
      message: 'You are offline. Cached jobs are still available.',
      duration: 4000,
      color: 'warning',
      position: 'top',
      icon: 'cloud-offline-outline'
    });
    await toast.present();
  }
}
