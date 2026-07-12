"""
jobspy.scrapers.findwork
~~~~~~~~~~~~~~~~~~~

This module contains routines to scrape Findwork.
"""

from __future__ import annotations

import os
import logging
from datetime import date
from typing import Optional

from .. import Scraper, ScraperInput, Site
from ..utils import create_session, extract_emails_from_text
from ...jobs import (
    JobPost,
    Location,
    JobResponse,
)
from ..exceptions import FindworkException

logger = logging.getLogger("JobSpy")

FINDWORK_API_KEY = os.getenv("FINDWORK_API_KEY", "")
FINDWORK_BASE_URL = os.getenv("FINDWORK_BASE_URL", "https://findwork.dev/api/jobs/")


class FindworkScraper(Scraper):
    base_url = FINDWORK_BASE_URL

    def __init__(self, proxy: str | None = None):
        site = Site.FINDWORK
        super().__init__(site, proxy=proxy)
        self.session = create_session(proxy=proxy)

    def scrape(self, scraper_input: ScraperInput) -> JobResponse:
        if not FINDWORK_API_KEY:
            logger.warning("Findwork: FINDWORK_API_KEY not set, skipping")
            return JobResponse(jobs=[])

        job_list: list[JobPost] = []

        params = {
            "search": scraper_input.search_term,
            "page_size": min(scraper_input.results_wanted, 50),
        }
        if scraper_input.location:
            params["location"] = scraper_input.location

        params = {k: v for k, v in params.items() if v is not None}

        try:
            headers = {
                "Authorization": f"Token {FINDWORK_API_KEY}",
                "Accept": "application/json",
            }
            response = self.session.get(self.base_url, params=params, headers=headers)

            if response.status_code == 401:
                logger.error("Findwork: Invalid API key")
                return JobResponse(jobs=[])
            if response.status_code == 429:
                logger.warning("Findwork: Rate limit exceeded")
                return JobResponse(jobs=[])
            if response.status_code not in range(200, 400):
                logger.error(f"Findwork: {response.status_code} {response.text[:200]}")
                return JobResponse(jobs=[])

            data = response.json()
            results = data.get("results", [])

            for item in results[: scraper_input.results_wanted]:
                job = self._process_job(item)
                if job:
                    job_list.append(job)

        except FindworkException:
            raise
        except Exception as e:
            logger.error(f"Findwork: {e}")

        return JobResponse(jobs=job_list)

    def _process_job(self, item: dict) -> Optional[JobPost]:
        title = item.get("title", "")
        job_url = item.get("url", "")
        if not title or not job_url:
            return None

        company_name = item.get("company_name")

        location_str = item.get("location", "")
        location = Location(
            city=location_str if location_str else None,
            country=None,
        )

        description = item.get("description", "") or ""

        date_posted = None
        pub_date = item.get("pub_date")
        if pub_date:
            try:
                date_posted = date.fromisoformat(
                    pub_date.replace("Z", "+00:00").split("T")[0]
                )
            except (ValueError, AttributeError):
                pass

        return JobPost(
            title=title,
            company_name=company_name,
            location=location,
            job_url=job_url,
            description=description,
            date_posted=date_posted,
            emails=extract_emails_from_text(description) if description else None,
        )
