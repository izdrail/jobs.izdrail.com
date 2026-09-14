import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

/**
 * Single storage abstraction for the whole app.
 *
 * Native (Capacitor) builds persist through @capacitor/preferences (backed by
 * SharedPreferences on Android / UserDefaults on iOS); the browser/PWA keeps
 * using localStorage. Reads are served synchronously from an in-memory cache
 * hydrated once at app start (see AppModule's APP_INITIALIZER), so callers
 * such as the auth interceptor stay synchronous.
 */
@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private readonly cache = new Map<string, string>();
  private readonly isNative = Capacitor.isNativePlatform();
  private ready = false;

  async init(): Promise<void> {
    if (this.ready) {
      return;
    }
    if (this.isNative) {
      const { keys } = await Preferences.keys();
      for (const key of keys) {
        const { value } = await Preferences.get({ key });
        if (value !== null) {
          this.cache.set(key, value);
        }
      }
    } else {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key !== null) {
          const value = localStorage.getItem(key);
          if (value !== null) {
            this.cache.set(key, value);
          }
        }
      }
    }
    this.ready = true;
  }

  get(key: string): string | null {
    return this.cache.has(key) ? (this.cache.get(key) as string) : null;
  }

  set(key: string, value: string): void {
    this.cache.set(key, value);
    void this.persist(key, value);
  }

  remove(key: string): void {
    this.cache.delete(key);
    if (this.isNative) {
      void Preferences.remove({ key });
    } else {
      localStorage.removeItem(key);
    }
  }

  private async persist(key: string, value: string): Promise<void> {
    if (this.isNative) {
      await Preferences.set({ key, value });
    } else {
      try {
        localStorage.setItem(key, value);
      } catch {
        // quota exceeded or storage unavailable
      }
    }
  }
}
