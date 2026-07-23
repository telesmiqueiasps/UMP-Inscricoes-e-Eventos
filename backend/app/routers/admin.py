from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks, File, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import List, Optional
from decimal import Decimal
from pydantic import BaseModel
import httpx
import uuid
import os

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_admin, get_current_user
from app.models.evento import Evento
from app.models.inscricao import Inscricao
from app.models.usuario import Usuario
from app.models.pagamento import Pagamento
from app.models.parcela import Parcela
from app.schemas.evento import EventoCreate, EventoUpdate, EventoResponse
from app.schemas.inscricao import InscricaoResponse
from app.schemas.pagamento import PagamentoResponse, ParcelaResponse
from app.services.email import enviar_email_confirmacao

router = APIRouter(tags=["Administração e Eventos"])


# --- Rota Pública para Listar Eventos Ativos ---
@router.get("/eventos/publico", response_model=List[EventoResponse])
def listar_eventos_publico(db: Session = Depends(get_db)):
    eventos = db.query(Evento).filter(Evento.ativo == True).order_by(Evento.data_inicio.asc()).all()
    for ev in eventos:
        total_inscritos = db.query(Inscricao).filter(
            Inscricao.evento_id == ev.id,
            Inscricao.status != "CANCELADA"
        ).count()
        ev.vagas_restantes = (ev.max_participantes - total_inscritos) if ev.max_participantes else None
    return eventos


@router.get("/eventos/publico/{id}", response_model=EventoResponse)
def obter_evento_publico(id: int, db: Session = Depends(get_db)):
    evento = db.query(Evento).filter(Evento.id == id, Evento.ativo == True).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado ou inativo.")
    total_inscritos = db.query(Inscricao).filter(
        Inscricao.evento_id == evento.id,
        Inscricao.status != "CANCELADA"
    ).count()
    evento.vagas_restantes = (evento.max_participantes - total_inscritos) if evento.max_participantes else None
    return evento


# --- Painel Administrativo ---

@router.get("/admin/metrics")
def obter_metricas_admin(
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    total_eventos = db.query(Evento).count()
    total_usuarios = db.query(Usuario).filter(Usuario.is_admin == False).count()
    total_inscricoes = db.query(Inscricao).count()
    inscricoes_confirmadas = db.query(Inscricao).filter(Inscricao.status == "CONFIRMADA").count()
    inscricoes_pendentes = db.query(Inscricao).filter(Inscricao.status == "PENDENTE").count()
    
    receita_total = db.query(func.sum(Pagamento.valor)).filter(Pagamento.status == "PAGO").scalar() or 0.0

    return {
        "total_eventos": total_eventos,
        "total_usuarios": total_usuarios,
        "total_inscricoes": total_inscricoes,
        "inscricoes_confirmadas": inscricoes_confirmadas,
        "inscricoes_pendentes": inscricoes_pendentes,
        "receita_total": float(receita_total)
    }


# --- Eventos (CRUD Admin) ---

@router.get("/admin/eventos", response_model=List[EventoResponse])
def listar_eventos_admin(
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    eventos = db.query(Evento).order_by(Evento.created_at.desc()).all()
    for ev in eventos:
        total_inscritos = db.query(Inscricao).filter(
            Inscricao.evento_id == ev.id,
            Inscricao.status != "CANCELADA"
        ).count()
        ev.vagas_restantes = (ev.max_participantes - total_inscritos) if ev.max_participantes else None
    return eventos


@router.post("/admin/eventos", response_model=EventoResponse, status_code=status.HTTP_201_CREATED)
def criar_evento_admin(
    evento_in: EventoCreate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    db_evento = Evento(**evento_in.model_dump())
    db.add(db_evento)
    db.commit()
    db.refresh(db_evento)
    db_evento.vagas_restantes = db_evento.max_participantes
    return db_evento


@router.get("/admin/eventos/{id}", response_model=EventoResponse)
def obter_evento_admin(
    id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    evento = db.query(Evento).filter(Evento.id == id).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")
    total_inscritos = db.query(Inscricao).filter(
        Inscricao.evento_id == evento.id,
        Inscricao.status != "CANCELADA"
    ).count()
    evento.vagas_restantes = (evento.max_participantes - total_inscritos) if evento.max_participantes else None
    return evento


@router.put("/admin/eventos/{id}", response_model=EventoResponse)
def atualizar_evento_admin(
    id: int,
    evento_in: EventoUpdate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    evento = db.query(Evento).filter(Evento.id == id).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")
    
    update_data = evento_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(evento, field, value)
        
    db.commit()
    db.refresh(evento)
    
    total_inscritos = db.query(Inscricao).filter(
        Inscricao.evento_id == evento.id,
        Inscricao.status != "CANCELADA"
    ).count()
    evento.vagas_restantes = (evento.max_participantes - total_inscritos) if evento.max_participantes else None
    return evento


@router.delete("/admin/eventos/{id}", status_code=status.HTTP_204_NO_CONTENT)
def deletar_evento_admin(
    id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    evento = db.query(Evento).filter(Evento.id == id).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")
    db.delete(evento)
    db.commit()
    return None


@router.put("/admin/eventos/{id}/toggle-status", response_model=EventoResponse)
def toggle_status_evento_admin(
    id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    evento = db.query(Evento).filter(Evento.id == id).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")
    evento.ativo = not evento.ativo
    db.commit()
    db.refresh(evento)
    return evento


# --- Gerenciamento de Inscrições ---

@router.get("/admin/inscricoes", response_model=List[InscricaoResponse])
def listar_inscricoes_admin(
    evento_id: Optional[int] = Query(None),
    status_filtro: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=1000),
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    query = db.query(Inscricao).join(Usuario).join(Evento)

    if evento_id:
        query = query.filter(Inscricao.evento_id == evento_id)
    if status_filtro:
        query = query.filter(Inscricao.status == status_filtro)
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            or_(
                Usuario.nome.ilike(search_pattern),
                Usuario.email.ilike(search_pattern),
                Usuario.cpf.ilike(search_pattern)
            )
        )

    offset = (page - 1) * limit
    inscricoes = query.order_by(Inscricao.created_at.desc()).offset(offset).limit(limit).all()
    return inscricoes


@router.put("/admin/inscricoes/{id}/status", response_model=InscricaoResponse)
def atualizar_status_inscricao_admin(
    id: int,
    background_tasks: BackgroundTasks,
    novo_status: str = Query(..., description="PENDENTE, CONFIRMADA, CANCELADA"),
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    inscricao = db.query(Inscricao).filter(Inscricao.id == id).first()
    if not inscricao:
        raise HTTPException(status_code=404, detail="Inscrição não encontrada.")
    
    status_anterior = inscricao.status
    inscricao.status = novo_status.upper()
    db.commit()
    db.refresh(inscricao)

    # Se a inscrição foi confirmada e antes não era confirmada, enviar e-mail
    if inscricao.status == "CONFIRMADA" and status_anterior != "CONFIRMADA":
        background_tasks.add_task(
            enviar_email_confirmacao,
            destinatario_email=inscricao.usuario.email,
            destinatario_nome=inscricao.usuario.nome,
            nome_evento=inscricao.evento.titulo
        )

    return inscricao


# --- Gerenciamento de Pagamentos e Parcelas ---

@router.get("/admin/pagamentos", response_model=List[PagamentoResponse])
def listar_pagamentos_admin(
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    return db.query(Pagamento).order_by(Pagamento.created_at.desc()).all()


@router.put("/admin/parcelas/{id}/status", response_model=ParcelaResponse)
def atualizar_status_parcela_admin(
    id: int,
    background_tasks: BackgroundTasks,
    novo_status: str = Query(..., description="PENDENTE, PAGO, CANCELADO"),
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    parcela = db.query(Parcela).filter(Parcela.id == id).first()
    if not parcela:
        raise HTTPException(status_code=404, detail="Parcela não encontrada.")
    
    parcela.status = novo_status.upper()
    db.commit()
    db.refresh(parcela)

    # Verificar se todas as parcelas do pagamento foram pagas
    pagamento = db.query(Pagamento).filter(Pagamento.id == parcela.pagamento_id).first()
    if pagamento:
        todas_pagas = all(p.status == "PAGO" for p in pagamento.parcelas)
        if todas_pagas:
            status_anterior = pagamento.inscricao.status
            pagamento.status = "PAGO"
            # Confirmar inscrição automaticamente
            pagamento.inscricao.status = "CONFIRMADA"
            db.commit()

            # Se antes não estava confirmada, enviar e-mail
            if status_anterior != "CONFIRMADA":
                background_tasks.add_task(
                    enviar_email_confirmacao,
                    destinatario_email=pagamento.inscricao.usuario.email,
                    destinatario_nome=pagamento.inscricao.usuario.nome,
                    nome_evento=pagamento.inscricao.evento.titulo
                )

    return parcela


# --- Configurações do Sistema (Admin) ---
from app.models.configuracao import Configuracao

class AtualizarConfiguracoesRequest(BaseModel):
    infinitepay_handle: Optional[str] = None
    pix_chave: Optional[str] = None
    pix_nome_recebedor: Optional[str] = None
    pix_cidade_recebedor: Optional[str] = None

@router.get("/admin/configuracoes")
def obter_configuracoes_admin(
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    from app.services.config import (
        get_infinitepay_handle,
        get_pix_chave,
        get_pix_nome_recebedor,
        get_pix_cidade_recebedor
    )
    return {
        "infinitepay_handle": get_infinitepay_handle(),
        "pix_chave": get_pix_chave(),
        "pix_nome_recebedor": get_pix_nome_recebedor(),
        "pix_cidade_recebedor": get_pix_cidade_recebedor()
    }

@router.put("/admin/configuracoes")
def atualizar_configuracoes_admin(
    req: AtualizarConfiguracoesRequest,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    updates = {
        "infinitepay_handle": req.infinitepay_handle,
        "pix_chave": req.pix_chave,
        "pix_nome_recebedor": req.pix_nome_recebedor,
        "pix_cidade_recebedor": req.pix_cidade_recebedor
    }
    for chave, valor in updates.items():
        if valor is not None:
            config = db.query(Configuracao).filter(Configuracao.chave == chave).first()
            if not config:
                config = Configuracao(chave=chave, valor=valor)
                db.add(config)
            else:
                config.valor = valor
    db.commit()
    return {"message": "Configurações salvas com sucesso!"}


@router.post("/admin/eventos/upload")
async def upload_foto_evento(
    file: UploadFile = File(...),
    admin: Usuario = Depends(get_current_admin)
):
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        raise HTTPException(
            status_code=400,
            detail="Configuração do Supabase Storage ausente no arquivo .env (SUPABASE_URL e SUPABASE_KEY)."
        )

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
        raise HTTPException(status_code=400, detail="Formato de arquivo inválido. Apenas imagens são permitidas.")

    filename = f"{uuid.uuid4()}{ext}"
    clean_url = settings.SUPABASE_URL.rstrip('/')
    upload_url = f"{clean_url}/storage/v1/object/{settings.SUPABASE_BUCKET}/{filename}"
    
    headers = {
        "Authorization": f"Bearer {settings.SUPABASE_KEY}",
        "Content-Type": file.content_type
    }
    
    file_content = await file.read()
    
    async with httpx.AsyncClient() as client:
        response = await client.post(upload_url, headers=headers, content=file_content)
        
    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Erro ao enviar arquivo para o Supabase Storage: {response.text}"
        )
        
    public_url = f"{clean_url}/storage/v1/object/public/{settings.SUPABASE_BUCKET}/{filename}"
    return {"url": public_url}
