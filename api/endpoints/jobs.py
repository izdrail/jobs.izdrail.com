import logging
import io
import json
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
import pandas as pd

from ..database import get_db
from ..models import CachedSearch
from .jobspy import scrape_jobs

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["jobs"])

CACHE_TTL_HOURS = 1


class JobsSearch(BaseModel):
    keyword: str = Field(min_length=1, max_length=120)


class JobFilters(BaseModel):
    is_remote: bool | None = None
    job_type: str | None = Field(default=None, max_length=40)
    min_salary: float | None = Field(default=None, ge=0)
    max_salary: float | None = Field(default=None, ge=0)
    date_posted_within_days: int | None = Field(default=None, ge=1, le=90)
    site: str | None = Field(default=None, max_length=40)
    technologies: list[str] | None = Field(default=None, max_length=10)


class JobsSearchQuery(BaseModel):
    keyword: str = Field(min_length=1, max_length=120)
    filters: JobFilters | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=50)


def fetch_jobs_for_keyword(db: Session, keyword: str) -> list[dict]:
    """Return the raw job list for a keyword, from cache or a fresh scrape."""
    cached = (
        db.query(CachedSearch)
        .filter(CachedSearch.keyword == keyword)
        .order_by(CachedSearch.created_at.desc())
        .first()
    )

    if cached and (
        datetime.now(timezone.utc) - cached.created_at.replace(tzinfo=timezone.utc)
    ) < timedelta(hours=CACHE_TTL_HOURS):
        logger.info(f"Cache hit for keyword: {keyword}")
        return json.loads(cached.results)

    logger.info(f"Scraping jobs for keyword: {keyword}")
    jobs: pd.DataFrame = scrape_jobs(
        site_name=[
            "indeed",
            "linkedin",
            "glassdoor",
            "the_guardian",
            "cv_library",
            "builtin",
            "findwork",
            "jobicy",
        ],
        search_term=keyword,
        description_format="html",
        location="United Kingdom",
        results_wanted=50,
        country_indeed="uk",
    )

    if jobs.empty:
        logger.warning("No jobs found")
        return []

    json_data = jobs.to_json(
        orient="records",
        date_format="iso",
        double_precision=10,
        force_ascii=False,
        date_unit="ms",
    )
    python_dict = json.loads(json_data)

    entry = CachedSearch(
        id=f"cache_{uuid.uuid4().hex[:12]}",
        keyword=keyword,
        results=json.dumps(python_dict),
    )
    db.add(entry)
    db.commit()

    return python_dict


def _normalise_token(value: str) -> str:
    return "".join(ch for ch in value.lower() if ch.isalnum())


def apply_filters(jobs: list[dict], filters: JobFilters | None) -> list[dict]:
    if filters is None:
        return jobs

    result = jobs

    if filters.is_remote is not None:
        result = [j for j in result if bool(j.get("is_remote")) == filters.is_remote]

    if filters.job_type:
        wanted = _normalise_token(filters.job_type)
        result = [
            j
            for j in result
            if wanted in _normalise_token(str(j.get("job_type") or ""))
        ]

    if filters.site:
        wanted_site = filters.site.lower()
        result = [
            j
            for j in result
            if str(j.get("site") or "").lower() == wanted_site
        ]

    if filters.min_salary is not None or filters.max_salary is not None:
        def salary_matches(job: dict) -> bool:
            low = job.get("min_amount")
            high = job.get("max_amount")
            if low is None and high is None:
                return False
            low = float(low) if low is not None else 0.0
            high = float(high) if high is not None else float("inf")
            if filters.min_salary is not None and high < filters.min_salary:
                return False
            if filters.max_salary is not None and low > filters.max_salary:
                return False
            return True

        result = [j for j in result if salary_matches(j)]

    if filters.date_posted_within_days is not None:
        cutoff = (
            datetime.now(timezone.utc)
            - timedelta(days=filters.date_posted_within_days)
        ).date()
        kept = []
        for j in result:
            posted = j.get("date_posted")
            if not posted:
                continue
            try:
                posted_date = datetime.fromisoformat(
                    str(posted).replace("Z", "+00:00")
                ).date()
            except ValueError:
                continue
            if posted_date >= cutoff:
                kept.append(j)
        result = kept

    if filters.technologies:
        wanted_techs = [t.lower() for t in filters.technologies if t.strip()]
        if wanted_techs:
            def tech_matches(job: dict) -> bool:
                haystack = (
                    f"{job.get('title') or ''} {job.get('description') or ''}"
                ).lower()
                return all(t in haystack for t in wanted_techs)

            result = [j for j in result if tech_matches(j)]

    return result


@router.post("/jobs")
async def search_jobs(jobSearch: JobsSearch, db: Session = Depends(get_db)):
    try:
        data = fetch_jobs_for_keyword(db, jobSearch.keyword)
        return {"data": data, "cached": False}

    except ValueError as e:
        logger.error(f"ValueError: {e}")
        raise HTTPException(status_code=400, detail=str(e))

    except Exception:
        logger.exception("Internal server error")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/jobs/search")
async def search_jobs_paged(query: JobsSearchQuery, db: Session = Depends(get_db)):
    """Filtered, paginated search. Backwards compatible with POST /jobs."""
    try:
        jobs = fetch_jobs_for_keyword(db, query.keyword)
        filtered = apply_filters(jobs, query.filters)

        total = len(filtered)
        start = (query.page - 1) * query.page_size
        end = start + query.page_size
        page_data = filtered[start:end]

        return {
            "data": page_data,
            "page": query.page,
            "page_size": query.page_size,
            "total": total,
            "has_more": end < total,
        }

    except ValueError as e:
        logger.error(f"ValueError: {e}")
        raise HTTPException(status_code=400, detail=str(e))

    except Exception:
        logger.exception("Internal server error")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/jobs/detail")
async def job_detail(
    url: str = Query(min_length=1, max_length=2048),
    db: Session = Depends(get_db),
):
    """Fetch one job by its job_url (the app's existing job identifier)."""
    entries = (
        db.query(CachedSearch).order_by(CachedSearch.created_at.desc()).all()
    )
    for entry in entries:
        try:
            jobs = json.loads(entry.results)
        except (ValueError, TypeError):
            continue
        if not isinstance(jobs, list):
            continue
        for job in jobs:
            if isinstance(job, dict) and job.get("job_url") == url:
                return {"data": job}

    raise HTTPException(status_code=404, detail="Job no longer available")

@router.get("/jobs/export")
async def export_jobs_csv(
    keyword: str | None = Query(None, description="Filter by keyword"),
    db: Session = Depends(get_db),
):
    try:
        query = db.query(CachedSearch)
        if keyword:
            query = query.filter(CachedSearch.keyword == keyword)
        cached_entries = query.all()

        all_jobs = []
        for entry in cached_entries:
            jobs_data = json.loads(entry.results)
            if isinstance(jobs_data, list):
                all_jobs.extend(jobs_data)

        if not all_jobs:
            raise HTTPException(status_code=404, detail="No jobs found to export")

        df = pd.DataFrame(all_jobs)

        # Flatten location
        if "location" in df.columns:
            location_df = pd.json_normalize(df["location"])
            location_df.columns = [f"location_{col}" for col in location_df.columns]
            df = pd.concat([df.drop(columns=["location"]), location_df], axis=1)

        # Flatten compensation
        if "compensation" in df.columns:
            comp_df = pd.json_normalize(df["compensation"].dropna())
            comp_df.columns = [f"compensation_{col}" for col in comp_df.columns]
            df = pd.concat([df.drop(columns=["compensation"]), comp_df], axis=1)

        # Convert list columns to strings
        for col in df.columns:
            if df[col].apply(lambda x: isinstance(x, list)).any():
                df[col] = df[col].apply(
                    lambda x: ", ".join(str(i) for i in x) if isinstance(x, list) else x
                )

        # Drop heavy columns
        df = df.drop(
            columns=[
                "description",
                "company_description",
                "ceo_photo_url",
                "banner_photo_url",
            ],
            errors="ignore",
        )

        stream = io.StringIO()
        df.to_csv(stream, index=False)
        stream.seek(0)

        filename = f"jobs_{keyword or 'all'}.csv"
        return StreamingResponse(
            iter([stream.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Internal server error")
        raise HTTPException(status_code=500, detail="Internal server error")
