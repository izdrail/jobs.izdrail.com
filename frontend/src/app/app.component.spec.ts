import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { MenuController, Platform, ToastController } from '@ionic/angular';
import { BehaviorSubject, of } from 'rxjs';

import { AppComponent } from './app.component';
import { AuthService } from './core/services/auth.service';
import { UserService } from './core/services/user.service';
import { SubscriptionService } from './core/services/subscription.service';
import { SubscriptionStatus } from './core/models/user.model';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AppComponent],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate', 'navigateByUrl'], { url: '/home' }) },
        { provide: Location, useValue: jasmine.createSpyObj('Location', ['back']) },
        { provide: MenuController, useValue: jasmine.createSpyObj('MenuController', ['close', 'isOpen']) },
        { provide: Platform, useValue: { backButton: { subscribeWithPriority: () => {} } } },
        { provide: ToastController, useValue: jasmine.createSpyObj('ToastController', ['create']) },
        {
          provide: AuthService,
          useValue: {
            isLoggedIn$: of(false),
            logout: () => {}
          }
        },
        {
          provide: UserService,
          useValue: { displayName$: of('Guest') }
        },
        {
          provide: SubscriptionService,
          useValue: { status$: new BehaviorSubject(SubscriptionStatus.None).asObservable() }
        }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
