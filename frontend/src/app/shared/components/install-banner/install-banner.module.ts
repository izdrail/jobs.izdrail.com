import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { InstallBannerComponent } from './install-banner.component';

@NgModule({
  declarations: [InstallBannerComponent],
  imports: [CommonModule, IonicModule],
  exports: [InstallBannerComponent]
})
export class InstallBannerModule {}
