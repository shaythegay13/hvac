"""FastAPI entry point for the HVAC Margin Rescue Agent backend."""

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from backend.db.connection import init_db
from backend.routes.portfolio import router as portfolio_router
from backend.routes.dossier import router as dossier_router
from backend.routes.chat import router as chat_router
from backend.routes.email import router as email_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="HVAC Margin Rescue Agent", version="0.1.0", lifespan=lifespan)

# Allow one or more frontend origins via FRONTEND_URL env var (comma-separated).
# Defaults to localhost:3000 for local development.
_frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
allowed_origins = [u.strip() for u in _frontend_url.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(portfolio_router)
app.include_router(dossier_router)
app.include_router(chat_router)
app.include_router(email_router)


@app.get("/health")
def health():
    return {"status": "ok"}
