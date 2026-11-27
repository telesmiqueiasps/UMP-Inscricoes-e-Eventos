from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
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
from app.services.igreja_service import validar_igreja_dados_extras
from datetime import datetime

router = APIRouter(prefix="/inscricoes", tags=["Inscrições"])


def validar_vagas_e_pagamento_evento(evento: Evento, dados_extras: dict, forma_pagamento: Optional[str], db: Session):
    # 1. Validar forma de pagamento permitida
    if forma_pagamento == "PARCELADO" and not getattr(evento, "permitir_carne", True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A opção de parcelamento via carnê/boleto não está disponível para este evento."
        )

    # 2. Validar limite de vagas
    tipo_vagas = getattr(evento, "tipo_vagas", "GERAL") or "GERAL"
    inscricoes_ativas = db.query(Inscricao).filter(
        Inscricao.evento_id == evento.id,
        Inscricao.status != "CANCELADA"
    ).all()

    if tipo_vagas == "GENERO":
        ext = dados_extras or {}
        genero = (ext.get("genero") or ext.get("sexo") or "").strip().lower()
        if not genero:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O preenchimento do campo Gênero é obrigatório para inscrição neste evento."
            )

        if genero.startswith("f"):
            count_fem = sum(1 for ins in inscricoes_ativas if (ins.dados_extras or {}).get("genero", "").strip().lower().startswith("f") or (ins.dados_extras or {}).get("sexo", "").strip().lower().startswith("f"))
            if evento.vagas_femininas is not None and count_fem >= evento.vagas_femininas:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Infelizmente as vagas femininas para este evento foram esgotadas."
                )
        elif genero.startswith("m"):
            count_masc = sum(1 for ins in inscricoes_ativas if (ins.dados_extras or {}).get("genero", "").strip().lower().startswith("m") or (ins.dados_extras or {}).get("sexo", "").strip().lower().startswith("m"))
            if evento.vagas_masculinas is not None and count_masc >= evento.vagas_masculinas:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Infelizmente as vagas masculinas para este evento foram esgotadas."
                )
    else:
        if evento.max_participantes:
            if len(inscricoes_ativas) >= evento.max_participantes:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Infelizmente as vagas para este evento foram esgotadas."
                )


@router.post("", response_model=InscricaoResponse, status_code=status.HTTP_201_CREATED)
def criar_inscricao(
    inscricao_in: InscricaoCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    validar_igreja_dados_extras(db, inscricao_in.dados_extras)
    # 1. Verificar se evento existe e está ativo
    evento = db.query(Evento).filter(Evento.id == inscricao_in.evento_id, Evento.ativo == True).first()
    if not evento:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evento não encontrado ou indisponível para inscrições."
        )

    if evento.inscricoes_encerradas:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="As inscrições regulares para este evento foram encerradas."
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

    # 3. Validar limite de vagas e formas de pagamento
    validar_vagas_e_pagamento_evento(evento, inscricao_in.dados_extras, inscricao_in.forma_pagamento, db)

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
    validar_igreja_dados_extras(db, triagem_in.dados_extras)
    # 1. Verificar evento
    evento = db.query(Evento).filter(Evento.id == triagem_in.evento_id, Evento.ativo == True).first()
    if not evento:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evento não encontrado ou indisponível."
        )

    if evento.inscricoes_encerradas:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="As inscrições regulares para este evento foram encerradas."
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

    # Validar vagas e forma de pagamento permitida
    validar_vagas_e_pagamento_evento(evento, triagem_in.dados_extras, triagem_in.forma_pagamento, db)

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

    if triagem:
        evento = triagem.evento or db.query(Evento).filter(Evento.id == evento_id).first()
        if evento and evento.valor is not None and triagem.valor_total != evento.valor:
            triagem.valor_total = evento.valor
            db.commit()
            db.refresh(triagem)

    return triagem

