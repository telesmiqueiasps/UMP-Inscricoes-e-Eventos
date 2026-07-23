from fastapi import FastAPI, Request, Response
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
        # Executar migração dinâmica para adicionar as novas colunas
        from sqlalchemy import text
        with engine.connect() as conn:
            try:
                conn.execute(text("ALTER TABLE eventos ADD COLUMN IF NOT EXISTS link_pagamento_cartao VARCHAR(500);"))
                conn.execute(text("ALTER TABLE eventos ADD COLUMN IF NOT EXISTS link_pagamento_pix VARCHAR(500);"))
                conn.execute(text("ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10,2);"))
                conn.execute(text("ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS capture_method VARCHAR(50);"))
                conn.execute(text("ALTER TABLE parcelas ADD COLUMN IF NOT EXISTS alerta_previo_enviado BOOLEAN DEFAULT FALSE;"))
                conn.execute(text("ALTER TABLE parcelas ADD COLUMN IF NOT EXISTS alerta_atraso_enviado BOOLEAN DEFAULT FALSE;"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_pagamentos_order_nsu ON pagamentos(order_nsu);"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_pagamentos_transaction_nsu ON pagamentos(transaction_nsu);"))
                conn.commit()
                logging.info("Colunas e índices da tabela pagamentos/parcelas verificados/criados com sucesso.")
            except Exception as err:
                logging.warning(f"Erro ao criar colunas/índices adicionais de eventos/pagamentos/parcelas: {err}")
    except Exception as e:
        logging.error(f"Erro na conexão com o banco de dados durante a inicialização: {e}")

    # Inicializar o loop periódico de reconciliação de pagamentos em background
    import asyncio
    from app.services.reconciliation import reconciliation_loop
    reconciliation_task = asyncio.create_task(reconciliation_loop())

    yield

    # Cancelar a task em background no encerramento da aplicação
    reconciliation_task.cancel()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Middleware para garantir CORS em TODAS as requisições (incluindo erros, preflight OPTIONS e redirecionamentos)
@app.middleware("http")
async def custom_cors_middleware(request: Request, call_next):
    origin = request.headers.get("origin", "*")
    
    # Responder imediatamente requisições de Preflight (OPTIONS)
    if request.method == "OPTIONS":
        response = Response(status_code=200)
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        response.headers["Access-Control-Allow-Headers"] = request.headers.get("access-control-request-headers", "*")
        response.headers["Access-Control-Allow-Credentials"] = "true"
        return response

    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Credentials"] = "true"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response


# CORSMiddleware padrão do FastAPI como camada secundária
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
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
