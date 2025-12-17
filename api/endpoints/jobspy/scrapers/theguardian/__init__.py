import requests
from bs4 import BeautifulSoup
from typing import Optional, Tuple, List
from datetime import datetime
import re

from .. import Scraper, ScraperInput, Site
from ..utils import create_session, logger
from ...jobs import (
    JobPost,
    Compensation,
    Location,
    JobResponse,
    JobType,
)

class TheGuardianScraper(Scraper):
    def __init__(self, proxy: Optional[str] = None):
        """
        Initializes TheGuardianScraper with the The Guardian Jobs search url
        """
        site = Site(Site.THE_GUARDIAN)
        super().__init__(site, proxy=proxy)
        self.base_url = "https://jobs.theguardian.com"
        
    def scrape(self, scraper_input: ScraperInput) -> JobResponse:
        """
        Scrapes The Guardian Jobs for jobs with scraper_input criteria.
        :param scraper_input: Information about job search criteria.
        :return: JobResponse containing a list of jobs.
        """
        self.scraper_input = scraper_input
        self.session = create_session(self.proxy)
        # Add browser-like headers to avoid 403
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        })

        all_jobs: List[JobPost] = []
        
        # Build URL
        params = {}
        if scraper_input.search_term:
            params["Keywords"] = scraper_input.search_term
        if scraper_input.location:
            params["location"] = scraper_input.location
            
        # Pagination
        page = 1
        while len(all_jobs) < scraper_input.results_wanted:
            try:
                # Calculate current page URL (The Guardian uses page parameter, e.g. /jobs/page/2/)
                # Base search URL: https://jobs.theguardian.com/jobs/
                # With params: https://jobs.theguardian.com/jobs/?Keywords=php
                # Pagination seems to be typically: https://jobs.theguardian.com/jobs/page/2/?Keywords=php
                
                url = f"{self.base_url}/jobs/"
                if page > 1:
                    url = f"{url}page/{page}/"
                
                response = self.session.get(url, params=params)
                if response.status_code != 200:
                    break
                    
                soup = BeautifulSoup(response.text, "html.parser")
                job_listings = soup.select(".lister__item") 
                
                if not job_listings:
                    break # No more jobs found
                
                for job_card in job_listings:
                    if len(all_jobs) >= scraper_input.results_wanted:
                        break
                        
                    job = self._process_job(job_card)
                    if job:
                        all_jobs.append(job)
                        
                # Check for next page
                # The pagination links usually look like "Next" text or class pagination__link--next
                # In the HTML generic, let's look for a generic next link if possible, or just rely on loop increment
                # The generic pagination usually has a class like 'pagination__item--next' or similar
                # "Load more" isn't present, it's a standard pagination
                next_button = soup.select_one(".pagination__item--next a, .paginator__item--next a")
                if not next_button:
                    # If we can't find next button but found jobs, we might try incrementing page anyway until 404 or empty
                    if len(job_listings) < 10: # If we found few jobs, likely last page
                        break
                page += 1
                
            except Exception as e:
                logger.error(f"Error scraping The Guardian: {e}")
                break

        return JobResponse(jobs=all_jobs)

    def _process_job(self, job_card) -> Optional[JobPost]:
        try:
            # Title and URL
            title_tag = job_card.select_one(".lister__header a")
            if not title_tag:
                return None
            
            title = title_tag.get_text(strip=True)
            job_url = title_tag.get("href", "").strip()
            if job_url.startswith("/"):
                job_url = f"{self.base_url}{job_url}"
                
            # Company
            company_name = "Unknown"
            company_elem = job_card.select_one(".lister__meta-item--recruiter")
            if company_elem:
                company_name = company_elem.get_text(strip=True)
            
            # Location
            location_obj = None
            loc_elem = job_card.select_one(".lister__meta-item--location") 
            if loc_elem:
                loc_text = loc_elem.get_text(strip=True)
                # Simple parsing: "City, Country" or just "Country"
                # For now, put it all in city/state or leave generic
                location_obj = Location(city=loc_text, country="UK") # Defaulting country to UK as context implies, or generic
            
            # Date Posted
            date_posted = None
            # Look for date in footer actions
            actions = job_card.select(".job-actions__action")
            for action in actions:
                text = action.get_text(strip=True)
                if "ago" in text or "yesterday" in text.lower() or "today" in text.lower():
                    # Simple relative date parsing could go here
                    # For now we'll set it to today if verified, or leave None
                    date_posted = datetime.now().date() # Placeholder: usually would parse "7 days ago"
                    break

            # Salary
            compensation = None
            salary_elem = job_card.select_one(".lister__meta-item--salary")
            if salary_elem:
                salary_text = salary_elem.get_text(strip=True)
                # Could parse "£35,000 - £40,000" here using regex
                # For now returning raw string is not supported by object, so we skip or simple parse
                pass

            return JobPost(
                title=title,
                company_name=company_name,
                job_url=job_url,
                location=location_obj,
                date_posted=date_posted,
                description=None
            )
        except Exception:
            return None
