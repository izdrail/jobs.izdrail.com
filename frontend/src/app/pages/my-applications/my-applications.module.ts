import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { MyApplicationsPageRoutingModule } from './my-applications-routing.module';
import { MyApplicationsPage } from './my-applications.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MyApplicationsPageRoutingModule
  ],
  declarations: [MyApplicationsPage]
})
export class MyApplicationsPageModule {}
