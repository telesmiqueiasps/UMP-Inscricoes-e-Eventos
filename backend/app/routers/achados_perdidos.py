import os
import uuid
from typing import Optional, List
from datetime import datetime
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import text, or_, desc

from app.core.config import settings
from app.core.database import get_db, engine, Base
from app.core.security import get_current_admin, get_current_user
from app.models.usuario import Usuario
from app.models.evento import Evento
from app.models.achado_perdido import AchadoPerdido
from app.schemas.achado_perdido import (
    AchadoPerdidoCreate,
    AchadoPerdidoUpdate,
    AchadoPerdidoEntregarRequest,
    AchadoPerdidoReivindicarRequest,
    AchadoPerdidoResponse
)

router = APIRouter(tags=["Achados e Perdidos"])

_TABELA_ACHADOS_VERIFICADA = False


def _garantir_tabelas_achados_perdidos():
    global _TABELA_ACHADOS_VERIFICADA
    if _TABELA_ACHADOS_VERIFICADA:
        return
    try:
        Base.metadata.create_all(bind=engine, tables=[AchadoPerdido.__table__])
        with engine.connect() as conn:
            try:
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS achados_perdidos (
                        id SERIAL PRIMARY KEY,
                        evento_id INTEGER REFERENCES eventos(id) ON DELETE SET NULL,
                        titulo VARCHAR(160) NOT NULL,
                        descricao TEXT,
                        local_encontrado VARCHAR(160),
                        data_encontrado VARCHAR(30),
                        foto_url TEXT NOT NULL,
                        status VARCHAR(30) DEFAULT 'DISPONIVEL' NOT NULL,
                        reivindicado_por_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
                        reivindicado_em TIMESTAMP WITH TIME ZONE,
                        reivindicacao_mensagem TEXT,
                        entregue_em TIMESTAMP WITH TIME ZONE,
                        entregue_por_nome VARCHAR(150),
                        entregue_para_nome VARCHAR(150),
                        entregue_observacao TEXT,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                """))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_achados_evento ON achados_perdidos(evento_id);"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_achados_status ON achados_perdidos(status);"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_achados_reivindicado ON achados_perdidos(reivindicado_por_usuario_id);"))
                conn.commit()
            except Exception:
                pass
        _TABELA_ACHADOS_VERIFICADA = True
    except Exception:
        pass


def deletar_foto_supabase(url: Optional[str]):
    if not url or not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        return
    clean_url = settings.SUPABASE_URL.rstrip('/')
    bucket = settings.SUPABASE_BUCKET or "eventos"
    bucket_prefix = f"{clean_url}/storage/v1/object/public/{bucket}/"

    if url.startswith(bucket_prefix):
        filename = url[len(bucket_prefix):]
    else:
        alt_prefix = f"/storage/v1/object/public/{bucket}/"
        if alt_prefix in url:
            filename = url.split(alt_prefix)[-1]
        else:
            filename = url.split('/')[-1]

    filename = filename.strip()
    if not filename:
        return

    headers = {
        "Authorization": f"Bearer {settings.SUPABASE_KEY}",
        "Content-Type": "application/json"
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            try:
                res = client.request(
                    "DELETE",
                    f"{clean_url}/storage/v1/object/{bucket}",
                    headers=headers,
                    json={"prefixes": [filename]}
                )
                if res.status_code in (200, 204):
                    return
            except Exception:
                pass

            try:
                client.delete(
                    f"{clean_url}/storage/v1/object/{bucket}/{filename}",
                    headers={"Authorization": f"Bearer {settings.SUPABASE_KEY}"}
                )
            except Exception:
                pass
    except Exception:
        pass


def _formatar_item_response(item: AchadoPerdido, current_user_id: Optional[int] = None) -> dict:
    reivindicante_info = None
    if item.reivindicado_por:
        reivindicante_info = {
            "id": item.reivindicado_por.id,
            "nome": item.reivindicado_por.nome,
            "email": item.reivindicado_por.email,
            "telefone": item.reivindicado_por.telefone or getattr(item.reivindicado_por, 'whatsapp', None)
        }

    return {
        "id": item.id,
        "evento_id": item.evento_id,
        "evento_nome": item.evento.titulo if item.evento else "Geral / Não Vinculado",
        "titulo": item.titulo,
        "descricao": item.descricao,
        "local_encontrado": item.local_encontrado,
        "data_encontrado": item.data_encontrado,
        "foto_url": item.foto_url,
        "status": item.status,
        "reivindicado_por_usuario_id": item.reivindicado_por_usuario_id,
        "reivindicado_por": reivindicante_info,
        "reivindicado_em": item.reivindicado_em.isoformat() if item.reivindicado_em else None,
        "reivindicacao_mensagem": item.reivindicacao_mensagem,
        "sou_eu_que_reivindiquei": bool(current_user_id and item.reivindicado_por_usuario_id == current_user_id),
        "entregue_em": item.entregue_em.isoformat() if item.entregue_em else None,
        "entregue_por_nome": item.entregue_por_nome,
        "entregue_para_nome": item.entregue_para_nome,
        "entregue_observacao": item.entregue_observacao,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


# ========================================================
# ROTAS DE ADMINISTRAÇÃO (Organização)
# ========================================================

@router.get("/admin/achados-perdidos")
def listar_achados_admin(
    evento_id: Optional[int] = Query(None),
    status_filtro: Optional[str] = Query(None, alias="status"),
    q: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    _garantir_tabelas_achados_perdidos()
    query = db.query(AchadoPerdido)

    if evento_id:
        query = query.filter(AchadoPerdido.evento_id == evento_id)

    if status_filtro and status_filtro.upper() not in ("TODOS", "ALL", ""):
        query = query.filter(AchadoPerdido.status == status_filtro.upper())

    if q and q.strip():
        termo = f"%{q.strip()}%"
        query = query.filter(
            or_(
                AchadoPerdido.titulo.ilike(termo),
                AchadoPerdido.descricao.ilike(termo),
                AchadoPerdido.local_encontrado.ilike(termo)
            )
        )

    itens = query.order_by(desc(AchadoPerdido.created_at)).all()
    return [_formatar_item_response(it) for it in itens]


@router.post("/admin/achados-perdidos/upload")
async def upload_foto_achado(
    file: UploadFile = File(...),
    admin: Usuario = Depends(get_current_admin)
):
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        raise HTTPException(
            status_code=400,
            detail="Configuração do Supabase Storage ausente no arquivo .env."
        )

    ext = os.path.splitext(file.filename)[1].lower()
    allowed_exts = [".jpg", ".jpeg", ".png", ".webp", ".gif"]
    if ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail="Formato de arquivo inválido. Apenas imagens (.jpg, .jpeg, .png, .webp) são permitidas."
        )

    file_content = await file.read()
    if len(file_content) > 15 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="Arquivo muito grande. O limite máximo permitido para fotos é de 15MB."
        )

    filename = f"achados_{uuid.uuid4()}{ext}"
    clean_url = settings.SUPABASE_URL.rstrip('/')
    bucket = settings.SUPABASE_BUCKET or "eventos"
    upload_url = f"{clean_url}/storage/v1/object/{bucket}/{filename}"

    headers = {
        "Authorization": f"Bearer {settings.SUPABASE_KEY}",
        "Content-Type": file.content_type
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(upload_url, headers=headers, content=file_content)

    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Erro ao enviar arquivo para o Supabase Storage: {response.text}"
        )

    public_url = f"{clean_url}/storage/v1/object/public/{bucket}/{filename}"
    return {"url": public_url, "filename": filename}


@router.post("/admin/achados-perdidos", status_code=status.HTTP_201_CREATED)
def criar_achado_admin(
    payload: AchadoPerdidoCreate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    _garantir_tabelas_achados_perdidos()

    if not payload.titulo or not payload.titulo.strip():
        raise HTTPException(status_code=400, detail="O título ou identificação do item é obrigatório.")

    if not payload.foto_url or not payload.foto_url.strip():
        raise HTTPException(status_code=400, detail="A foto do item achado é obrigatória.")

    evento_id = payload.evento_id
    if evento_id:
        ev = db.query(Evento).filter(Evento.id == evento_id).first()
        if not ev:
            raise HTTPException(status_code=404, detail="Evento informado não encontrado.")

    novo_item = AchadoPerdido(
        evento_id=evento_id,
        titulo=payload.titulo.strip(),
        descricao=payload.descricao.strip() if payload.descricao else None,
        local_encontrado=payload.local_encontrado.strip() if payload.local_encontrado else None,
        data_encontrado=payload.data_encontrado.strip() if payload.data_encontrado else None,
        foto_url=payload.foto_url.strip(),
        status="DISPONIVEL"
    )

    db.add(novo_item)
    db.commit()
    db.refresh(novo_item)
    return _formatar_item_response(novo_item)


@router.put("/admin/achados-perdidos/{item_id}")
def atualizar_achado_admin(
    item_id: int,
    payload: AchadoPerdidoUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    _garantir_tabelas_achados_perdidos()
    item = db.query(AchadoPerdido).filter(AchadoPerdido.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item de achados e perdidos não encontrado.")

    if payload.titulo is not None:
        if not payload.titulo.strip():
            raise HTTPException(status_code=400, detail="O título não pode ser vazio.")
        item.titulo = payload.titulo.strip()

    if payload.descricao is not None:
        item.descricao = payload.descricao.strip() if payload.descricao else None

    if payload.local_encontrado is not None:
        item.local_encontrado = payload.local_encontrado.strip() if payload.local_encontrado else None

    if payload.data_encontrado is not None:
        item.data_encontrado = payload.data_encontrado.strip() if payload.data_encontrado else None

    if payload.evento_id is not None:
        if payload.evento_id > 0:
            ev = db.query(Evento).filter(Evento.id == payload.evento_id).first()
            if not ev:
                raise HTTPException(status_code=404, detail="Evento não encontrado.")
            item.evento_id = payload.evento_id
        else:
            item.evento_id = None

    if payload.foto_url is not None:
        nova_foto = payload.foto_url.strip() if payload.foto_url else None
        if nova_foto and item.foto_url and item.foto_url != nova_foto:
            background_tasks.add_task(deletar_foto_supabase, item.foto_url)
        if nova_foto:
            item.foto_url = nova_foto

    if payload.status is not None:
        st_norm = payload.status.upper()
        if st_norm in ("DISPONIVEL", "REIVINDICADO", "ENTREGUE"):
            item.status = st_norm

    db.commit()
    db.refresh(item)
    return _formatar_item_response(item)


@router.delete("/admin/achados-perdidos/{item_id}")
def excluir_achado_admin(
    item_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    _garantir_tabelas_achados_perdidos()
    item = db.query(AchadoPerdido).filter(AchadoPerdido.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item de achados e perdidos não encontrado.")

    if item.foto_url:
        background_tasks.add_task(deletar_foto_supabase, item.foto_url)

    db.delete(item)
    db.commit()
    return {"sucesso": True, "mensagem": "Item excluído com sucesso."}


@router.post("/admin/achados-perdidos/{item_id}/entregar")
def marcar_como_entregue_admin(
    item_id: int,
    payload: AchadoPerdidoEntregarRequest,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    _garantir_tabelas_achados_perdidos()
    item = db.query(AchadoPerdido).filter(AchadoPerdido.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado.")

    nome_destinatario = payload.entregue_para_nome
    if not nome_destinatario and item.reivindicado_por:
        nome_destinatario = item.reivindicado_por.nome

    item.status = "ENTREGUE"
    item.entregue_em = datetime.utcnow()
    item.entregue_por_nome = admin.nome
    item.entregue_para_nome = nome_destinatario or "Participante Identificado"
    item.entregue_observacao = payload.entregue_observacao.strip() if payload.entregue_observacao else None

    db.commit()
    db.refresh(item)
    return {"sucesso": True, "mensagem": "Item marcado como entregue com sucesso!", "item": _formatar_item_response(item)}


@router.post("/admin/achados-perdidos/{item_id}/desfazer-entrega")
def desfazer_entrega_admin(
    item_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    _garantir_tabelas_achados_perdidos()
    item = db.query(AchadoPerdido).filter(AchadoPerdido.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado.")

    # Se havia reivindicação, volta para REIVINDICADO, senão volta para DISPONIVEL
    if item.reivindicado_por_usuario_id:
        item.status = "REIVINDICADO"
    else:
        item.status = "DISPONIVEL"

    item.entregue_em = None
    item.entregue_por_nome = None
    item.entregue_para_nome = None
    item.entregue_observacao = None

    db.commit()
    db.refresh(item)
    return {"sucesso": True, "mensagem": "Entrega desfeita com sucesso.", "item": _formatar_item_response(item)}


@router.post("/admin/achados-perdidos/{item_id}/rejeitar-reivindicacao")
def rejeitar_reivindicacao_admin(
    item_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    _garantir_tabelas_achados_perdidos()
    item = db.query(AchadoPerdido).filter(AchadoPerdido.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado.")

    item.reivindicado_por_usuario_id = None
    item.reivindicado_em = None
    item.reivindicacao_mensagem = None
    if item.status != "ENTREGUE":
        item.status = "DISPONIVEL"

    db.commit()
    db.refresh(item)
    return {"sucesso": True, "mensagem": "Reivindicação removida e item liberado.", "item": _formatar_item_response(item)}


# ========================================================
# ROTAS DO PARTICIPANTE (Área do Usuário)
# ========================================================

@router.get("/usuario/achados-perdidos")
def listar_achados_participante(
    evento_id: Optional[int] = Query(None),
    status_filtro: Optional[str] = Query(None, alias="status"),
    q: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    _garantir_tabelas_achados_perdidos()
    query = db.query(AchadoPerdido)

    if evento_id:
        query = query.filter(AchadoPerdido.evento_id == evento_id)

    if status_filtro:
        st_norm = status_filtro.upper()
        if st_norm == "MEUS":
            query = query.filter(AchadoPerdido.reivindicado_por_usuario_id == current_user.id)
        elif st_norm in ("DISPONIVEL", "REIVINDICADO", "ENTREGUE"):
            query = query.filter(AchadoPerdido.status == st_norm)

    if q and q.strip():
        termo = f"%{q.strip()}%"
        query = query.filter(
            or_(
                AchadoPerdido.titulo.ilike(termo),
                AchadoPerdido.descricao.ilike(termo),
                AchadoPerdido.local_encontrado.ilike(termo)
            )
        )

    itens = query.order_by(desc(AchadoPerdido.created_at)).all()
    return [_formatar_item_response(it, current_user.id) for it in itens]


@router.post("/usuario/achados-perdidos/{item_id}/reivindicar")
def reivindicar_achado_participante(
    item_id: int,
    payload: AchadoPerdidoReivindicarRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    _garantir_tabelas_achados_perdidos()
    item = db.query(AchadoPerdido).filter(AchadoPerdido.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item de achados e perdidos não encontrado.")

    if item.status == "ENTREGUE":
        raise HTTPException(status_code=400, detail="Este item já foi entregue pela organização.")

    if item.status == "REIVINDICADO" and item.reivindicado_por_usuario_id != current_user.id:
        raise HTTPException(
            status_code=400,
            detail="Este item já foi marcado por outro participante e está em análise com a organização."
        )

    item.status = "REIVINDICADO"
    item.reivindicado_por_usuario_id = current_user.id
    item.reivindicado_em = datetime.utcnow()
    item.reivindicacao_mensagem = payload.mensagem.strip() if payload.mensagem else None

    db.commit()
    db.refresh(item)
    return {
        "sucesso": True,
        "mensagem": "Você marcou este item como seu! Dirija-se à secretaria ou organização para retirá-lo.",
        "item": _formatar_item_response(item, current_user.id)
    }


@router.post("/usuario/achados-perdidos/{item_id}/cancelar-reivindicacao")
def cancelar_reivindicacao_participante(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    _garantir_tabelas_achados_perdidos()
    item = db.query(AchadoPerdido).filter(AchadoPerdido.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item de achados e perdidos não encontrado.")

    if item.reivindicado_por_usuario_id != current_user.id:
        raise HTTPException(status_code=403, detail="Você não reivindicou este item.")

    if item.status == "ENTREGUE":
        raise HTTPException(status_code=400, detail="Este item já foi entregue e a ação não pode ser desfeita pelo participante.")

    item.status = "DISPONIVEL"
    item.reivindicado_por_usuario_id = None
    item.reivindicado_em = None
    item.reivindicacao_mensagem = None

    db.commit()
    db.refresh(item)
    return {
        "sucesso": True,
        "mensagem": "Reivindicação cancelada com sucesso. O item voltou a ficar disponível.",
        "item": _formatar_item_response(item, current_user.id)
    }
