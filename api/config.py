"""Central runtime configuration.

Values come from environment variables so no secrets live in source control.
Development defaults keep local setups working out of the box; production
deployments must set JOBSWIPE_SECRET_KEY and any billing/CORS settings.
"""

import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# --- Auth / JWT -------------------------------------------------------------
SECRET_KEY = os.environ.get(
    "JOBSWIPE_SECRET_KEY", "jobswipe-secret-key-change-in-production"
)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRY_DAYS = 30
# An expired access token may be exchanged for a fresh one within this window.
REFRESH_GRACE_DAYS = 7

# --- Subscriptions ----------------------------------------------------------
TRIAL_DAYS = 3

# Iaptic receipt validation. Billing verification is disabled (and fails
# safely with 503) until both values are provided on the server.
IAPTIC_VALIDATOR_URL = os.environ.get("JOBSWIPE_IAPTIC_VALIDATOR_URL", "")
IAPTIC_API_KEY = os.environ.get("JOBSWIPE_IAPTIC_API_KEY", "")

# --- Uploads ----------------------------------------------------------------
UPLOAD_DIR = os.environ.get("JOBSWIPE_UPLOAD_DIR", os.path.join(BASE_DIR, "uploads"))
MAX_RESUME_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_RESUME_EXTENSIONS = {".pdf", ".doc", ".docx", ".txt", ".md"}

# --- CORS -------------------------------------------------------------------
# Browser dev servers plus the Capacitor WebView origins. The production SPA
# is same-origin with the API. Override with a comma-separated list.
_DEFAULT_CORS_ORIGINS = [
    "https://jobs.izdrail.com",
    "https://localhost",
    "capacitor://localhost",
    "http://localhost",
    "http://localhost:4200",
    "http://localhost:8100",
]
CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "JOBSWIPE_CORS_ORIGINS", ",".join(_DEFAULT_CORS_ORIGINS)
    ).split(",")
    if origin.strip()
]
