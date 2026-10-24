from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.config import settings

# Importing app.models registers every table on Base.metadata — needed so
# Alembic's autogenerate can see them (see alembic/env.py).
from app import models  # noqa: F401
from app.routers import auth, customers, routes, visits, gps_pings, deviation_alerts, users, menu, task_approvals, travel_allowance, organization, attendance, expenses, reports, dashboard, companies, meetings

app = FastAPI(title=settings.PROJECT_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to the web dashboard + mobile app origins before production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok", "environment": settings.ENVIRONMENT}


app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(customers.router, prefix="/api/customers", tags=["customers"])
app.include_router(routes.router, prefix="/api/routes", tags=["routes"])
app.include_router(visits.router, prefix="/api/visits", tags=["visits"])
app.include_router(gps_pings.router, prefix="/api/gps-pings", tags=["gps-pings"])
app.include_router(deviation_alerts.router, prefix="/api/deviation-alerts", tags=["deviation-alerts"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(menu.router, prefix="/api/menu", tags=["menu"])
app.include_router(task_approvals.router, prefix="/api", tags=["task-approvals"])
app.include_router(travel_allowance.router, prefix="/api", tags=["travel-allowance"])
app.include_router(organization.router, prefix="/api/organization", tags=["organization"])
app.include_router(attendance.router, prefix="/api/attendance", tags=["attendance"])
app.include_router(expenses.router, prefix="/api/expenses", tags=["expenses"])
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(companies.router, prefix="/api/companies", tags=["companies"])
app.include_router(meetings.router, prefix="/api/meetings", tags=["meetings"])

# Check-in photos — served back as plain files under /uploads/...
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
