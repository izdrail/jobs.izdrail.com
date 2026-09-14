// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  // Local FastAPI server (python main.py / Docker on port 1603).
  apiUrl: 'http://localhost:1603/api/v1',
  // Development-only: JobService may serve mock jobs after an API failure.
  // Never enabled in production builds.
  useMockJobsOnError: true,
  billing: {
    // 'none' | 'iaptic' | 'revenuecat' - see README "Payments & billing".
    provider: 'none' as 'none' | 'iaptic' | 'revenuecat',
    iapticPublicKey: '',
    iapticAppName: 'jobswipe',
    products: {
      monthly: 'jobswipe_monthly'
    }
  }
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
