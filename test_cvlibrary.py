from api.endpoints.jobspy import scrape_jobs, Site
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)

print("Starting scraper test for CV-Library...")
try:
    jobs = scrape_jobs(
        site_name="cv_library",
        search_term="php",
        results_wanted=5,
        verbose=2
    )
    print(f"Found {len(jobs)} jobs")
    if not jobs.empty:
        print(jobs[['title', 'company', 'location', 'job_url']].to_string())
    else:
        print("No jobs found.")
except Exception as e:
    print(f"An error occurred: {e}")
    import traceback
    traceback.print_exc()
