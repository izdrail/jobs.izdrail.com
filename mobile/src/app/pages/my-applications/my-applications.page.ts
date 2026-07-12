import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { ApplicationService } from '../../core/services/application.service';
import { JobApplication, ApplicationStatus } from '../../core/models/job.model';

@Component({
  selector: 'app-my-applications',
  templateUrl: './my-applications.page.html',
  styleUrls: ['./my-applications.page.scss'],
  standalone: false,
})
export class MyApplicationsPage implements OnInit {
  applications: JobApplication[] = [];

  constructor(
    private applicationService: ApplicationService,
    private alertController: AlertController,
    private router: Router
  ) {}

  ngOnInit() {
    this.applicationService.applications$.subscribe(apps => {
      this.applications = apps;
    });
  }

  getStatusLabel(status: ApplicationStatus): string {
    const labels: Record<string, string> = {
      'pending': 'Pending',
      'viewed': 'Viewed',
      'interview': 'Interview',
      'rejected': 'Rejected',
      'offer': 'Offer'
    };
    return labels[status] || status;
  }

  getStatusClass(status: ApplicationStatus): string {
    return status;
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  viewJob(application: JobApplication) {
    this.router.navigate(['/job', encodeURIComponent(application.job.job_url)]);
  }

  async confirmRemove(application: JobApplication) {
    const alert = await this.alertController.create({
      header: 'Remove Application',
      message: `Are you sure you want to remove your application to ${application.job.company || application.job.title}?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Remove',
          role: 'destructive',
          handler: () => {
            this.applicationService.removeApplication(application.id);
          }
        }
      ]
    });
    await alert.present();
  }
}
