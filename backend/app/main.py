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
    usuario_area,
    presbiterio,
    igreja,
    diarias,
    gincana
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
                conn.execute(text("ALTER TABLE eventos ADD COLUMN IF NOT EXISTS campos_formulario TEXT;"))
                conn.execute(text("ALTER TABLE eventos ADD COLUMN IF NOT EXISTS fotos TEXT;"))
                conn.execute(text("ALTER TABLE eventos ADD COLUMN IF NOT EXISTS diarias_habilitadas BOOLEAN DEFAULT FALSE;"))
                conn.execute(text("ALTER TABLE eventos ADD COLUMN IF NOT EXISTS config_diarias JSONB;"))
                conn.execute(text("ALTER TABLE eventos ADD COLUMN IF NOT EXISTS campos_formulario_diaria TEXT;"))
                conn.execute(text("ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10,2);"))
                conn.execute(text("ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS capture_method VARCHAR(50);"))
                conn.execute(text("ALTER TABLE parcelas ADD COLUMN IF NOT EXISTS alerta_previo_enviado BOOLEAN DEFAULT FALSE;"))
                conn.execute(text("ALTER TABLE parcelas ADD COLUMN IF NOT EXISTS alerta_atraso_enviado BOOLEAN DEFAULT FALSE;"))
                conn.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perfil_acesso VARCHAR(100) DEFAULT 'global';"))
                conn.execute(text("UPDATE usuarios SET perfil_acesso = 'global' WHERE perfil_acesso IS NULL;"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_pagamentos_order_nsu ON pagamentos(order_nsu);"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_pagamentos_transaction_nsu ON pagamentos(transaction_nsu);"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_diarias_triagem_usuario ON diarias_triagem(usuario_id);"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_diarias_triagem_evento ON diarias_triagem(evento_id);"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_inscricoes_diarias_usuario ON inscricoes_diarias(usuario_id);"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_inscricoes_diarias_evento ON inscricoes_diarias(evento_id);"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_inscricoes_diarias_checkin ON inscricoes_diarias(codigo_checkin);"))
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS gincanas (
                        id SERIAL PRIMARY KEY,
                        evento_id INTEGER REFERENCES eventos(id) ON DELETE SET NULL,
                        titulo VARCHAR(200) DEFAULT 'Gincana UMP' NOT NULL,
                        ativa BOOLEAN DEFAULT TRUE NOT NULL,
                        nome_equipe_1 VARCHAR(100) DEFAULT 'Equipe 1' NOT NULL,
                        cor_equipe_1 VARCHAR(30) DEFAULT '#2563EB' NOT NULL,
                        nome_equipe_2 VARCHAR(100) DEFAULT 'Equipe 2' NOT NULL,
                        cor_equipe_2 VARCHAR(30) DEFAULT '#DC2626' NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                """))
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS gincana_pontos (
                        id SERIAL PRIMARY KEY,
                        gincana_id INTEGER NOT NULL REFERENCES gincanas(id) ON DELETE CASCADE,
                        equipe INTEGER NOT NULL,
                        titulo VARCHAR(200) NOT NULL,
                        descricao TEXT,
                        pontos INTEGER NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                """))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_gincanas_evento ON gincanas(evento_id);"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_gincana_pontos_gincana ON gincana_pontos(gincana_id);"))
                conn.commit()
                logging.info("Colunas e índices verificados/criados com sucesso.")
            except Exception as err:
                logging.warning(f"Erro ao criar colunas/índices adicionais: {err}")
    except Exception as e:
        logging.error(f"Erro na conexão com o banco de dados durante a inicialização: {e}")

    # Inicializar o loop periódico de reconciliação de pagamentos em background
    import asyncio
    from app.services.reconciliation import reconciliation_loop
    reconciliation_task = asyncio.create_task(reconciliation_loop())

    yield

    # Cancelar a task em background no encerramento da aplicação
    reconciliation_task.cancel()
    
    # Liberar clientes HTTP persistentes, conexões e memória
    try:
        from app.services.infinitepay import infinitepay_service
        infinitepay_service.close()
    except Exception:
        pass

    try:
        from app.services.email import fechar_brevo_client
        fechar_brevo_client()
    except Exception:
        pass

    try:
        engine.dispose()
    except Exception:
        pass

    import gc
    gc.collect()


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

    try:
        response = await call_next(request)
    except Exception as exc:
        import traceback
        logging.error(f"Erro não tratado na requisição {request.url}: {traceback.format_exc()}")
        from fastapi.responses import JSONResponse
        response = JSONResponse(
            status_code=500,
            content={"detail": "Erro interno no servidor."}
        )

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
app.include_router(presbiterio.router, prefix=settings.API_V1_STR)
app.include_router(igreja.router, prefix=settings.API_V1_STR)
app.include_router(diarias.router, prefix=settings.API_V1_STR)
app.include_router(gincana.router, prefix=settings.API_V1_STR)


@app.get("/")
def root():
    return {
        "status": "online",
        "message": "Plataforma Web de Inscrições para Eventos - API Online",
        "docs": "/docs",
        "version": "1.0.0"
    }
