import os

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.database import engine, Base
from api.endpoints import jobs, auth, swipes, applications


app = FastAPI(
    title="Jobs API",
    description="A job search engine, no ads no fuss",
    version="0.0.6",
    terms_of_service="https://izdrail.com/terms/",
    contact={
        "name": "Stefan",
        "url": "https://izdrail.com/",
        "email": "stefan@izdrail.com",
    },
    license_info={
        "name": "Apache 2.0",
        "url": "https://www.apache.org/licenses/LICENSE-2.0.html",
    },
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

Base.metadata.create_all(bind=engine)

# Endpoints
app.include_router(jobs.router)
app.include_router(auth.router)
app.include_router(swipes.router)
app.include_router(applications.router)

# Path to Angular build
ANGULAR_BUILD_PATH = os.path.join(os.path.dirname(__file__), "frontend", "www")

# Serve Angular static assets
for subdir in ("assets", "icons", "svg"):
    subpath = os.path.join(ANGULAR_BUILD_PATH, subdir)
    if os.path.isdir(subpath):
        app.mount(f"/{subdir}", StaticFiles(directory=subpath), name=subdir)


@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API endpoint not found")

    file_path = os.path.join(ANGULAR_BUILD_PATH, full_path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)

    index_path = os.path.join(ANGULAR_BUILD_PATH, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)

    raise HTTPException(status_code=404, detail="Frontend not built properly")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=1603, reload=True)
