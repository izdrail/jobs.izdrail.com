import { Injectable, ApplicationRef } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { BehaviorSubject, Observable, fromEvent, merge, of } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class PwaService {
  private deferredPrompt: any = null;
  private isOnlineSubject = new BehaviorSubject<boolean>(navigator.onLine);
  private promptSubject = new BehaviorSubject<boolean>(false);
  private updateAvailableSubject = new BehaviorSubject<boolean>(false);

  isOnline$: Observable<boolean> = this.isOnlineSubject.asObservable();
  canInstall$: Observable<boolean> = this.promptSubject.asObservable();
  updateAvailable$: Observable<boolean> = this.updateAvailableSubject.asObservable();

  constructor(
    private updates: SwUpdate,
    private appRef: ApplicationRef
  ) {
    this.setupOnlineDetection();
    this.setupUpdateDetection();
    this.setupInstallPrompt();
  }

  private setupOnlineDetection() {
    const online$ = fromEvent(window, 'online').pipe(map(() => true));
    const offline$ = fromEvent(window, 'offline').pipe(map(() => false));
    merge(online$, offline$).subscribe(status => {
      this.isOnlineSubject.next(status);
    });
  }

  private setupUpdateDetection() {
    this.updates.versionUpdates.subscribe(event => {
      if (event.type === 'VERSION_READY') {
        this.updateAvailableSubject.next(true);
      }
    });
  }

  private setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.promptSubject.next(true);
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.promptSubject.next(false);
    });
  }

  async installApp(): Promise<boolean> {
    if (!this.deferredPrompt) {
      return false;
    }

    this.deferredPrompt.prompt();
    const result = await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    this.promptSubject.next(false);
    return result.outcome === 'accepted';
  }

  dismissInstallPrompt() {
    this.promptSubject.next(false);
    this.deferredPrompt = null;
  }

  async checkForUpdates() {
    try {
      await this.updates.checkForUpdate();
    } catch {
      // silently fail
    }
  }

  async applyUpdate() {
    await this.updates.activateUpdate();
    window.location.reload();
  }

  get isOnline(): boolean {
    return this.isOnlineSubject.value;
  }
}
