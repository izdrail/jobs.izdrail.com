export const environment = {
  production: true,
  // Absolute URL: the Capacitor Android WebView cannot resolve relative
  // paths, and the browser SPA is served from this same origin.
  apiUrl: 'https://jobs.izdrail.com/api/v1',
  // Hard guarantee: production builds can never show mock jobs.
  useMockJobsOnError: false,
  billing: {
    // Store purchases are disabled until merchant credentials are configured
    // (see README "Payments & billing"). The app fails safely in this state.
    provider: 'none' as 'none' | 'iaptic' | 'revenuecat',
    iapticPublicKey: '',
    iapticAppName: 'jobswipe',
    products: {
      monthly: 'jobswipe_monthly'
    }
  }
};
