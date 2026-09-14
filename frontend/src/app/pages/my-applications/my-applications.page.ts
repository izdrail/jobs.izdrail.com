import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, ActionSheetController, ToastController } from '@ionic/angular';
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

  readonly statusOptions: { value: ApplicationStatus; label: string }[] = [
    { value: ApplicationStatus.Pending, label: 'Pending' },
    { value: ApplicationStatus.Viewed, label: 'Viewed' },
    { value: ApplicationStatus.InterviewInvited, label: 'Interview' },
    { value: ApplicationStatus.OfferReceived, label: 'Offer' },
    { value: ApplicationStatus.Rejected, label: 'Rejected' }
  ];

  constructor(
    private applicationService: ApplicationService,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
    private toastController: ToastController,
    private router: Router
  ) {}

  ngOnInit() {
    this.applicationService.applications$.subscribe(apps => {
      this.applications = apps;
    });
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'pending': 'Pending',
      'viewed': 'Viewed',
      'interview': 'Interview',
      'rejected': 'Rejected',
      'offer': 'Offer'
    };
    return labels[status] || status;
  }

  getStatusClass(status: string): string {
    return status;
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  formatHistoryDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  }

  viewJob(application: JobApplication) {
    this.router.navigate(['/job', encodeURIComponent(application.job.job_url)]);
  }

  async changeStatus(application: JobApplication) {
    if (application.pendingSync) {
      return;
    }
    const sheet = await this.actionSheetController.create({
      header: 'Update status',
      buttons: [
        ...this.statusOptions.map(option => ({
          text: option.label + (option.value === application.status ? ' (current)' : ''),
          handler: () => {
            if (option.value !== application.status) {
              this.applicationService.updateStatus(application.id, option.value).subscribe({
                error: () => this.showToast('Could not update the status.', 'danger')
              });
            }
          }
        })),
        { text: 'Cancel', role: 'cancel' }
      ]
    });
    await sheet.present();
  }

  async editNotes(application: JobApplication) {
    if (application.pendingSync) {
      return;
    }
    const alert = await this.alertController.create({
      header: 'Notes',
      inputs: [
        {
          name: 'notes',
          type: 'textarea',
          placeholder: 'e.g. recruiter call on Friday',
          value: application.notes || ''
        }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: (data: { notes: string }) => {
            this.applicationService.updateNotes(application.id, data.notes || '').subscribe({
              error: () => this.showToast('Could not save the note.', 'danger')
            });
          }
        }
      ]
    });
    await alert.present();
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
            if (application.pendingSync) {
              this.applicationService.removePending(application.id);
            } else {
              this.applicationService.removeApplication(application.id).subscribe({
                error: () => this.showToast('Could not remove the application.', 'danger')
              });
            }
          }
        }
      ]
    });
    await alert.present();
  }

  private async showToast(message: string, color: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2500,
      color,
      position: 'bottom'
    });
    await toast.present();
  }
}
