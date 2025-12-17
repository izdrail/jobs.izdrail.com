import logging
import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import pandas as pd

# ✅ Use proper import (assuming jobspy is a local package in your project root)
from .jobspy import scrape_jobs

# Configure logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["jobs"])


class JobsSearch(BaseModel):
    keyword: str


@router.post("/jobs")
async def search_jobs(jobSearch: JobsSearch):
    try:
        jobs: pd.DataFrame = scrape_jobs(
            site_name=["indeed", "linkedin", "glassdoor", "the_guardian", "cv_library"],
            search_term=jobSearch.keyword,
            description_format="html",
            location="United Kingdom",
            results_wanted=50,
            country_indeed="uk",
        )

        if jobs.empty:
            logger.warning("No jobs found")
            return {"data": []}

        # Convert DataFrame -> JSON string -> Python list/dict
        json_data = jobs.to_json(
            orient="records",
            date_format="iso",
            double_precision=10,
            force_ascii=False,
            date_unit="ms"
        )
        python_dict = json.loads(json_data)

        return {"data": python_dict}

    except ValueError as e:
        logger.error(f"ValueError: {e}")
        raise HTTPException(status_code=400, detail=str(e))

    except Exception as e:
        logger.exception("Internal server error")
        raise HTTPException(status_code=500, detail="Internal server error")
