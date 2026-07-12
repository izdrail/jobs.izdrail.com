"""
jobspy.scrapers.jobicy
~~~~~~~~~~~~~~~~~~~

This module contains routines to scrape Jobicy.
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
    Compensation,
    CompensationInterval,
)
from ..exceptions import JobicyException

logger = logging.getLogger("JobSpy")

JOBICY_BASE_URL = os.getenv("JOBICY_BASE_URL", "https://jobicy.com/api/v2/remote-jobs")

SALARY_PERIOD_MAP = {
    "hourly": CompensationInterval.HOURLY,
    "daily": CompensationInterval.DAILY,
    "weekly": CompensationInterval.WEEKLY,
    "monthly": CompensationInterval.MONTHLY,
    "yearly": CompensationInterval.YEARLY,
    "annual": CompensationInterval.YEARLY,
}


class JobicyScraper(Scraper):
    base_url = JOBICY_BASE_URL

    def __init__(self, proxy: str | None = None):
        site = Site.JOBICY
        super().__init__(site, proxy=proxy)
        self.session = create_session(proxy=proxy)

    def scrape(self, scraper_input: ScraperInput) -> JobResponse:
        job_list: list[JobPost] = []

        params = {
            "count": min(scraper_input.results_wanted, 100),
        }
        if scraper_input.search_term:
            params["tag"] = scraper_input.search_term
        if scraper_input.location:
            params["geo"] = scraper_input.location

        params = {k: v for k, v in params.items() if v is not None}

        try:
            response = self.session.get(self.base_url, params=params)

            if response.status_code not in range(200, 400):
                logger.error(f"Jobicy: {response.status_code} {response.text[:200]}")
                return JobResponse(jobs=[])

            data = response.json()
            jobs = data.get("jobs", [])

            for item in jobs[: scraper_input.results_wanted]:
                job = self._process_job(item)
                if job:
                    job_list.append(job)

        except JobicyException:
            raise
        except Exception as e:
            logger.error(f"Jobicy: {e}")

        return JobResponse(jobs=job_list)

    def _process_job(self, item: dict) -> Optional[JobPost]:
        title = item.get("jobTitle", "")
        job_url = item.get("url", "")
        if not title or not job_url:
            return None

        company_name = item.get("companyName", "")

        job_geo = item.get("jobGeo", "")
        location = Location(
            city=job_geo if job_geo and job_geo.lower() != "anywhere" else None,
            country=job_geo if job_geo and job_geo.lower() != "anywhere" else None,
        )

        description = item.get("jobDescription", "") or ""

        date_posted = None
        pub_date = item.get("pubDate")
        if pub_date:
            try:
                date_posted = date.fromisoformat(
                    pub_date.replace("Z", "+00:00").split("T")[0]
                )
            except (ValueError, AttributeError):
                pass

        compensation = None
        salary_min = item.get("salaryMin")
        salary_max = item.get("salaryMax")
        salary_currency = item.get("salaryCurrency")
        salary_period = item.get("salaryPeriod")
        if salary_min or salary_max:
            interval = SALARY_PERIOD_MAP.get(
                salary_period.lower() if salary_period else "",
                CompensationInterval.YEARLY,
            )
            compensation = Compensation(
                interval=interval,
                min_amount=float(salary_min) if salary_min else None,
                max_amount=float(salary_max) if salary_max else None,
                currency=salary_currency or "USD",
            )

        job_type_str = item.get("jobType", "")
        job_type = None
        if job_type_str:
            from ..utils import get_enum_from_job_type

            job_type = get_enum_from_job_type(job_type_str)

        emails = extract_emails_from_text(description) if description else None

        return JobPost(
            title=title,
            company_name=company_name,
            location=location,
            job_url=job_url,
            description=description,
            date_posted=date_posted,
            job_type=job_type,
            compensation=compensation,
            emails=emails,
            is_remote=True,
        )
