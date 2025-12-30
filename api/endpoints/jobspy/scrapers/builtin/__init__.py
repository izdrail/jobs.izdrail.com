"""
jobspy.scrapers.builtin
~~~~~~~~~~~~~~~~~~~

This module contains routines to scrape Builtin.
"""
from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor

from .. import Scraper, ScraperInput, Site
from ..utils import create_session, extract_emails_from_text
from ...jobs import (
    JobPost,
    Location,
    JobResponse,
    JobType,
    Compensation,
)
from ..exceptions import BuiltinException

logger = logging.getLogger("JobSpy")


class BuiltinScraper(Scraper):
    base_url = "https://builtin.com"

    def __init__(self, proxy: str | None = None):
        site = Site.BUILTIN
        super().__init__(site, proxy=proxy)
        self.session = create_session(proxy=proxy)

    def scrape(self, scraper_input: ScraperInput) -> JobResponse:
        """
        Scrapes Builtin for jobs with scraper_input criteria.
        :param scraper_input: Information about job search criteria.
        :return: JobResponse containing a list of jobs.
        """
        job_list: list[JobPost] = []

        params = {
            "search": scraper_input.search_term,
            "city": scraper_input.location, # Builtin uses city/state/country query params usually, but specific ones need mapping
            # "state": "England", # TODO: Need to map location string to specific params for Builtin
            # "country": "GBR",
        }
        
        # If user provides a raw URL in search_term (which seems to be the case in the user request), handle it?
        # The user request was: "https://builtin.com/jobs?city=London&state=England&country=GBR&searcharea=25mi"
        # The general `scrape` function takes search_term and location.
        # But here I'll assume standard implementation: construct URL or use params.
        
        # For now, let's just construct a basic URL based on input
        url = f"{self.base_url}/jobs"
        
        # Mapping scraper_input to Builtin params is tricky without a map which I don't have.
        # I'll rely on the `requests` params, but note that `builtin` uses `city`, `state`, `country`.
        # I'll add a simple logic: if location is "London", try to guess. 
        # But generally, `search_term` -> `search`.
        
        if scraper_input.location and "London" in scraper_input.location:
             params["city"] = "London"
             params["state"] = "England"
             params["country"] = "GBR"
             params["searcharea"] = "25mi"
        elif scraper_input.location:
             params["city"] = scraper_input.location
             
        # Filter out None values
        params = {k: v for k, v in params.items() if v is not None}

        try:
            response = self.session.get(url, params=params)
            if response.status_code not in range(200, 400):
                logger.error(f"Builtin: {response.status_code} {response.text}")
                return JobResponse(jobs=[])
            
            # Parse JSON-LD
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(response.text, "html.parser")
            
            script_tag = soup.find('script', type='application/ld+json')
            if not script_tag:
                 logger.warning("Builtin: No JSON-LD found")
                 logger.warning(f"Response snippet: {response.text[:1000]}")
                 return JobResponse(jobs=[])
            
            data = json.loads(script_tag.string)
            items = []
            
            if isinstance(data, dict):
                if '@graph' in data:
                    for item in data['@graph']:
                        if item.get('@type') == 'ItemList':
                            items = item.get('itemListElement', [])
                            break
                elif data.get('@type') == 'ItemList':
                     items = data.get('itemListElement', [])
            
            for item in items:
                job = self._process_job(item)
                if job:
                    job_list.append(job)

        except Exception as e:
            logger.error(f"Builtin: {str(e)}")
            
        return JobResponse(jobs=job_list)

    def _process_job(self, item: dict) -> JobPost | None:
        title = item.get("name")
        job_url = item.get("url")
        if not title or not job_url:
            return None
            
        description = item.get("description", "")
        
        # Company name is missing in JSON-LD ItemList. 
        # We'll set it to None or try to extract from description if possible?
        company = None 
        
        # Attempt to infer location? No location in JSON-LD.
        location = Location(city=None, country=None)
        
        return JobPost(
            title=title,
            company_name=company,
            location=location,
            job_url=job_url,
            description=description,
            emails=extract_emails_from_text(description),
        )
