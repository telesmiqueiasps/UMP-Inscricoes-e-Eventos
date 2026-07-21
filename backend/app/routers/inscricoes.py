from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.usuario import Usuario
from app.models.evento import Evento
from app.models.inscricao import Inscricao
from app.schemas.inscricao import InscricaoCreate, InscricaoResponse

router = APIRouter(prefix="/inscricoes", tags=["Inscrições"])


@router.post("", response_model=InscricaoResponse, status_code=status.HTTP_201_CREATED)
def criar_inscricao(
    inscricao_in: InscricaoCreate,
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
        dados_extras=inscricao_in.dados_extras
    )
    db.add(db_inscricao)
    db.commit()
    db.refresh(db_inscricao)

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
