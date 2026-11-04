import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="Cognition MeetingOS",
    description="AI system that turns meetings into execution",
    version="2.0.0"
)

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Auth uses bearer tokens (no cookies), so credentials stay off
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5174,http://localhost:5173").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"chrome-extension://.*",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and register routes
from routes.meetings import router as meetings_router
from routes.tasks import router as tasks_router
from routes.companies import router as companies_router
from routes.analytics import router as analytics_router
from routes.extension import router as extension_router
from routes.notifications import router as notifications_router

app.include_router(meetings_router)
app.include_router(tasks_router)
app.include_router(companies_router)
app.include_router(analytics_router)
app.include_router(extension_router)
app.include_router(notifications_router)

@app.get("/")
def root():
    return {
        "app": os.getenv("APP_NAME"),
        "status": "running",
        "message": "MeetingOS backend is alive"
    }

@app.get("/health")
def health():
    return {"status": "ok"}