from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.usuario import Usuario
from app.models.evento import Evento
from app.models.diaria import DiariaTriagem, InscricaoDiaria
from app.schemas.diaria import (
    DiariaTriagemCreate,
    DiariaTriagemResponse,
    InscricaoDiariaResponse
)
from app.services.diaria_service import (
    criar_ou_atualizar_triagem_diaria
)
from app.services.infinitepay import infinitepay_service

router = APIRouter(prefix="/diarias", tags=["Diárias"])


@router.get("/evento/{evento_id}/config")
def obter_config_diarias_evento(
    evento_id: int,
    db: Session = Depends(get_db)
):
    """
    Retorna as configurações públicas de diárias do evento:
    se está habilitada, dias com preços e campos requeridos no formulário.
    """
    evento = db.query(Evento).filter(Evento.id == evento_id).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    return {
        "evento_id": evento.id,
        "titulo": evento.titulo,
        "descricao": evento.descricao,
        "data_inicio": evento.data_inicio.isoformat() if evento.data_inicio else None,
        "data_fim": evento.data_fim.isoformat() if evento.data_fim else None,
        "local": evento.local,
        "fotos": evento.fotos,
        "diarias_habilitadas": bool(evento.diarias_habilitadas),
        "config_diarias": evento.config_diarias or {},
        "campos_formulario_diaria": evento.campos_formulario_diaria or ""
    }


@router.post("/triagem", response_model=DiariaTriagemResponse, status_code=status.HTTP_201_CREATED)
def criar_triagem_diaria_endpoint(
    req: DiariaTriagemCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Registra ou atualiza uma intenção de compra de diária (triagem) e retorna o link de pagamento InfinitePay.
    """
    triagem, checkout_url = criar_ou_atualizar_triagem_diaria(
        db=db,
        current_user=current_user,
        evento_id=req.evento_id,
        dias_selecionados=req.dias_selecionados,
        dados_extras=req.dados_extras
    )

    response = DiariaTriagemResponse.from_orm(triagem)
    response.checkout_url = checkout_url
    return response


@router.get("/triagem/pendente", response_model=Optional[DiariaTriagemResponse])
def obter_triagem_diaria_pendente(
    evento_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Retorna a triagem de diária pendente do participante caso ele tenha preenchido anteriormente.
    """
    triagem = db.query(DiariaTriagem).filter(
        DiariaTriagem.usuario_id == current_user.id,
        DiariaTriagem.evento_id == evento_id,
        DiariaTriagem.status == "PENDENTE_PAGAMENTO"
    ).order_by(DiariaTriagem.created_at.desc()).first()

    if not triagem:
        return None

    order_nsu = f"DIARIA_TRIAGEM-{triagem.id}"
    checkout_res = infinitepay_service.criar_checkout_link(
        order_nsu=order_nsu,
        valor=triagem.valor_total,
        descricao=f"Diária ({triagem.quantidade_dias}d) - {triagem.evento.titulo if triagem.evento else 'Evento'}",
        customer_email=current_user.email,
        customer_name=current_user.nome
    )

    response = DiariaTriagemResponse.from_orm(triagem)
    response.checkout_url = checkout_res.get("checkout_url")
    return response


@router.get("/minhas", response_model=List[InscricaoDiariaResponse])
def listar_minhas_diarias(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Retorna a lista de diárias confirmadas do participante logado.
    """
    diarias = db.query(InscricaoDiaria).filter(
        InscricaoDiaria.usuario_id == current_user.id
    ).order_by(InscricaoDiaria.created_at.desc()).all()

    return diarias


@router.get("/{id}", response_model=InscricaoDiariaResponse)
def obter_diaria(
    id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Obtém uma diária específica.
    """
    diaria = db.query(InscricaoDiaria).filter(InscricaoDiaria.id == id).first()
    if not diaria:
        raise HTTPException(status_code=404, detail="Diária não encontrada.")

    if diaria.usuario_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acesso negado a esta diária.")

    return diaria
