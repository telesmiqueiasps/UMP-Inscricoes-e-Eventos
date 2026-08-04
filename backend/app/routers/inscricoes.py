from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
import uuid

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.usuario import Usuario
from app.models.evento import Evento
from app.models.inscricao import Inscricao
from app.models.inscricao_triagem import InscricaoTriagem
from app.schemas.inscricao import (
    InscricaoCreate, InscricaoResponse,
    InscricaoTriagemCreate, InscricaoTriagemResponse
)
from app.services.email import enviar_email_inscricao
from datetime import datetime

router = APIRouter(prefix="/inscricoes", tags=["Inscrições"])


@router.post("", response_model=InscricaoResponse, status_code=status.HTTP_201_CREATED)
def criar_inscricao(
    inscricao_in: InscricaoCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    # 1. Verificar se evento existe e está ativo
    evento = db.query(Evento).filter(Evento.id == inscricao_in.evento_id, Evento.ativo == True).first()
    if not evento:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evento não encontrado ou indisponível para inscrições."
        )

    # 2. Verificar duplicação de inscrição
    inscricao_existente = db.query(Inscricao).filter(
        Inscricao.usuario_id == current_user.id,
        Inscricao.evento_id == evento.id,
        Inscricao.status != "CANCELADA"
    ).first()

    if inscricao_existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Você já possui uma inscrição ativa para este evento."
        )

    # 3. Verificar limite de vagas (se houver)
    if evento.max_participantes:
        total_inscritos = db.query(Inscricao).filter(
            Inscricao.evento_id == evento.id,
            Inscricao.status != "CANCELADA"
        ).count()
        if total_inscritos >= evento.max_participantes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Infelizmente as vagas para este evento foram esgotadas."
            )

    # 4. Criar Inscrição
    db_inscricao = Inscricao(
        usuario_id=current_user.id,
        evento_id=evento.id,
        status="PENDENTE",
        forma_pagamento=inscricao_in.forma_pagamento,
        valor_total=evento.valor,
        dados_extras=inscricao_in.dados_extras,
        codigo_checkin=f"CK-{uuid.uuid4().hex[:12].upper()}"
    )
    db.add(db_inscricao)
    db.commit()
    db.refresh(db_inscricao)

    # Enviar e-mail de notificação de inscrição recebida em background
    background_tasks.add_task(
        enviar_email_inscricao,
        destinatario_email=current_user.email,
        destinatario_nome=current_user.nome,
        nome_evento=evento.titulo,
        valor=float(evento.valor),
        forma_pagamento=db_inscricao.forma_pagamento or "Não informada",
        whatsapp_grupo_link=evento.whatsapp_grupo_link
    )

    return db_inscricao


@router.get("/minhas", response_model=List[InscricaoResponse])
def listar_minhas_inscricoes(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    inscricoes = db.query(Inscricao).filter(Inscricao.usuario_id == current_user.id).order_by(Inscricao.created_at.desc()).all()
    return inscricoes


@router.get("/{id}", response_model=InscricaoResponse)
def obter_inscricao(
    id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    inscricao = db.query(Inscricao).filter(Inscricao.id == id).first()
    if not inscricao:
        raise HTTPException(status_code=404, detail="Inscrição não encontrada.")
    
    if inscricao.usuario_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acesso negado a esta inscrição.")

    return inscricao


@router.post("/triagem", response_model=InscricaoTriagemResponse, status_code=status.HTTP_201_CREATED)
def criar_ou_atualizar_triagem(
    triagem_in: InscricaoTriagemCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    # 1. Verificar evento
    evento = db.query(Evento).filter(Evento.id == triagem_in.evento_id, Evento.ativo == True).first()
    if not evento:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evento não encontrado ou indisponível."
        )

    # 2. Verificar se já tem inscrição oficial confirmada/ativa
    inscricao_existente = db.query(Inscricao).filter(
        Inscricao.usuario_id == current_user.id,
        Inscricao.evento_id == evento.id,
        Inscricao.status != "CANCELADA"
    ).first()

    if inscricao_existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Você já possui uma inscrição realizada para este evento."
        )

    # 3. Tratar data da primeira parcela
    dt_primeira = None
    if triagem_in.data_primeira_parcela:
        try:
            dt_primeira = datetime.strptime(triagem_in.data_primeira_parcela, "%Y-%m-%d").date()
        except ValueError:
            pass

    # 4. Buscar se já possui uma triagem PENDENTE_PAGAMENTO para este usuário + evento
    triagem_existente = db.query(InscricaoTriagem).filter(
        InscricaoTriagem.usuario_id == current_user.id,
        InscricaoTriagem.evento_id == evento.id,
        InscricaoTriagem.status == "PENDENTE_PAGAMENTO"
    ).first()

    if triagem_existente:
        triagem_existente.forma_pagamento = triagem_in.forma_pagamento
        triagem_existente.num_parcelas = triagem_in.num_parcelas or 1
        triagem_existente.data_primeira_parcela = dt_primeira
        triagem_existente.dados_extras = triagem_in.dados_extras
        triagem_existente.valor_total = evento.valor
        db.commit()
        db.refresh(triagem_existente)
        return triagem_existente

    # Criar nova triagem
    db_triagem = InscricaoTriagem(
        usuario_id=current_user.id,
        evento_id=evento.id,
        status="PENDENTE_PAGAMENTO",
        forma_pagamento=triagem_in.forma_pagamento,
        num_parcelas=triagem_in.num_parcelas or 1,
        data_primeira_parcela=dt_primeira,
        valor_total=evento.valor,
        dados_extras=triagem_in.dados_extras
    )
    db.add(db_triagem)
    db.commit()
    db.refresh(db_triagem)

    return db_triagem


@router.get("/triagem/pendente", response_model=Optional[InscricaoTriagemResponse])
def obter_triagem_pendente(
    evento_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    triagem = db.query(InscricaoTriagem).filter(
        InscricaoTriagem.usuario_id == current_user.id,
        InscricaoTriagem.evento_id == evento_id,
        InscricaoTriagem.status == "PENDENTE_PAGAMENTO"
    ).order_by(InscricaoTriagem.created_at.desc()).first()

    return triagem

