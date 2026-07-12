import logging
import io
import json
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
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
    keyword: str


@router.post("/jobs")
async def search_jobs(jobSearch: JobsSearch, db: Session = Depends(get_db)):
    try:
        cached = (
            db.query(CachedSearch)
            .filter(CachedSearch.keyword == jobSearch.keyword)
            .order_by(CachedSearch.created_at.desc())
            .first()
        )

        if cached and (
            datetime.now(timezone.utc) - cached.created_at.replace(tzinfo=timezone.utc)
        ) < timedelta(hours=CACHE_TTL_HOURS):
            logger.info(f"Cache hit for keyword: {jobSearch.keyword}")
            return {"data": json.loads(cached.results), "cached": True}

        logger.info(f"Scraping jobs for keyword: {jobSearch.keyword}")
        jobs: pd.DataFrame = scrape_jobs(
            site_name=[
                "indeed",
                "linkedin",
                "glassdoor",
                "the_guardian",
                "cv_library",
                "builtin",
                "findwork",
            ],
            search_term=jobSearch.keyword,
            description_format="html",
            location="United Kingdom",
            results_wanted=50,
            country_indeed="uk",
        )

        if jobs.empty:
            logger.warning("No jobs found")
            return {"data": [], "cached": False}

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
            keyword=jobSearch.keyword,
            results=json.dumps(python_dict),
        )
        db.add(entry)
        db.commit()

        return {"data": python_dict, "cached": False}

    except ValueError as e:
        logger.error(f"ValueError: {e}")
        raise HTTPException(status_code=400, detail=str(e))

    except Exception as e:
        logger.exception("Internal server error")
        raise HTTPException(status_code=500, detail="Internal server error")


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
