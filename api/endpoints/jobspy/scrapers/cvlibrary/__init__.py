import requests
from bs4 import BeautifulSoup
from typing import Optional, List
from datetime import datetime
import re

from .. import Scraper, ScraperInput, Site
from ..utils import create_session, logger
from ...jobs import (
    JobPost,
    Location,
    JobResponse,
)

class CVLibraryScraper(Scraper):
    def __init__(self, proxy: Optional[str] = None):
        """
        Initializes CVLibraryScraper with the CV-Library search url
        """
        site = Site(Site.CV_LIBRARY)
        super().__init__(site, proxy=proxy)
        self.base_url = "https://www.cv-library.co.uk"
        
    def scrape(self, scraper_input: ScraperInput) -> JobResponse:
        """
        Scrapes CV-Library for jobs with scraper_input criteria.
        :param scraper_input: Information about job search criteria.
        :return: JobResponse containing a list of jobs.
        """
        self.scraper_input = scraper_input
        self.session = create_session(self.proxy)
        # Add browser-like headers
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        })

        all_jobs: List[JobPost] = []
        
        # Build URL
        # Pattern: https://www.cv-library.co.uk/{keyword}-jobs?us=1
        keyword = scraper_input.search_term or "jobs"
        keyword_slug = keyword.replace(" ", "-").lower()
        search_path = f"/{keyword_slug}-jobs"
        
        params = {"us": "1"}
        if scraper_input.location:
             # CV-Library usually puts location in URL too, like /jobs/in-{location}?
             # But query params might work. Let's try standard query param 'location' or similar if supported, 
             # otherwise rely on keyword if complex. 
             # Actually, simpler to just use q key if supported, but user specified format /{keyword}-jobs
             pass

        page = 1
        while len(all_jobs) < scraper_input.results_wanted:
            try:
                url = f"{self.base_url}{search_path}"
                current_params = params.copy()
                if page > 1:
                    current_params["page"] = str(page)
                
                response = self.session.get(url, params=current_params)
                if response.status_code != 200:
                    logger.error(f"CV-Library status code: {response.status_code}")
                    break
                    
                soup = BeautifulSoup(response.text, "html.parser")
                job_listings = soup.select("article.job.search-card") 
                
                if not job_listings:
                    break 
                
                for job_card in job_listings:
                    if len(all_jobs) >= scraper_input.results_wanted:
                        break
                        
                    job = self._process_job(job_card)
                    if job:
                        all_jobs.append(job)
                        
                # Check for next page
                next_button = soup.select_one("ul.pagination li.next a")
                if not next_button:
                    break
                page += 1
                
            except Exception as e:
                logger.error(f"Error scraping CV-Library: {e}")
                break

        return JobResponse(jobs=all_jobs)

    def _process_job(self, job_card) -> Optional[JobPost]:
        try:
            # Data attributes are a goldmine here
            title = job_card.get("data-job-title")
            
            # URL still needs to be fetched from the link usually
            title_tag = job_card.select_one("h2.job__title a")
            job_url = ""
            if title_tag:
                 href = title_tag.get("href", "").strip()
                 if href:
                     if href.startswith("/"):
                         job_url = f"{self.base_url}{href}"
                     else:
                         job_url = href

            if not title or not job_url:
                return None
            
            # Company
            company_name = job_card.get("data-company-name", "Unknown")

            # Location
            location_obj = None
            loc_text = job_card.get("data-job-location")
            if loc_text:
                location_obj = Location(city=loc_text, country="UK")
            
            # Date Posted
            date_posted = None
            date_str = job_card.get("data-job-posted")
            if date_str:
                # Format: 2025-11-27T17:17:14Z
                try:
                    dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                    date_posted = dt.date()
                except ValueError:
                    # Fallback to text parsing if needed, but data-attribute is usually reliable
                    pass

            # Salary
            salary_text = job_card.get("data-job-salary")
            compensation = None
            if salary_text:
                # We can try to parse it or just leave it for now if object requires strict parsing
                # Scraper framework usually requires Compensation object parsing logic
                # For now we won't implement strict parsing unless requested
                pass

            return JobPost(
                title=title,
                company_name=company_name,
                job_url=job_url,
                location=location_obj,
                date_posted=date_posted,
                description=None
            )
        except Exception as e:
            logger.error(f"Error processing CV-Library job: {e}")
            return None
