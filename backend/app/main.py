from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from app.core.config import settings
from app.core.database import engine, Base
# Importar todos os modelos para registro no SQLAlchemy Base
import app.models  # noqa

from app.routers import (
    auth,
    admin,
    inscricoes,
    pagamentos,
    webhook_infinitepay,
    usuario_area
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        Base.metadata.create_all(bind=engine)
        logging.info("Tabelas do banco de dados verificadas/criadas com sucesso.")
    except Exception as e:
        logging.error(f"Erro na conexão com o banco de dados durante a inicialização: {e}")
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Configuração global de CORS permissiva para desenvolvimento e produção
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Registrar Routers na API v1
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(admin.router, prefix=settings.API_V1_STR)
app.include_router(inscricoes.router, prefix=settings.API_V1_STR)
app.include_router(pagamentos.router, prefix=settings.API_V1_STR)
app.include_router(webhook_infinitepay.router, prefix=settings.API_V1_STR)
app.include_router(usuario_area.router, prefix=settings.API_V1_STR)


@app.get("/")
def root():
    return {
        "status": "online",
        "message": "Plataforma Web de Inscrições para Eventos - API Online",
        "docs": "/docs",
        "version": "1.0.0"
    }
