import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.models.usuario import Usuario
from app.models.evento import Evento
from app.models.gratuita import InscricaoGratuita
from app.models.acomodacao import Acomodacao
from app.schemas.gratuita import GratuitaCreate, GratuitaUpdate
from app.core.security import require_permissao, require_admin_global

router = APIRouter(prefix="/admin/eventos/{evento_id}/gratuidades", tags=["Gratuidades & Inscrições Manuais"])


def _obter_evento_ou_404(db: Session, evento_id: int) -> Evento:
    evento = db.query(Evento).filter(Evento.id == evento_id).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")
    return evento


def _serializar_gratuita(g: InscricaoGratuita) -> Dict[str, Any]:
    ac = g.acomodacao
    return {
        "id": g.id,
        "evento_id": g.evento_id,
        "nome": g.nome,
        "contato": g.contato or "",
        "sexo": g.sexo or "",
        "observacao": g.observacao or "",
        "codigo_checkin": g.codigo_checkin,
        "checkin_realizado": bool(g.checkin_realizado),
        "checkin_data": g.checkin_data.isoformat() if g.checkin_data else None,
        "acomodacao_id": g.acomodacao_id,
        "acomodacao_nome": ac.nome if ac else None,
        "acomodacao_tipo": ac.tipo if ac else None,
        "acomodacao": ac.to_summary_dict() if ac else None,
        "created_at": g.created_at.isoformat() if g.created_at else None,
        "updated_at": g.updated_at.isoformat() if g.updated_at else None
    }


@router.get("")
def listar_gratuidades_evento(
    evento_id: int,
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("secretaria"))
) -> Dict[str, Any]:
    """Lista todas as inscrições gratuitas/manuais do evento com filtros e métricas."""
    _obter_evento_ou_404(db, evento_id)

    query = (
        db.query(InscricaoGratuita)
        .options(joinedload(InscricaoGratuita.acomodacao))
        .filter(InscricaoGratuita.evento_id == evento_id)
    )

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            (InscricaoGratuita.nome.ilike(term)) |
            (InscricaoGratuita.contato.ilike(term)) |
            (InscricaoGratuita.observacao.ilike(term)) |
            (InscricaoGratuita.codigo_checkin.ilike(term))
        )

    itens = query.order_by(InscricaoGratuita.nome.asc()).all()

    # Contadores gerais do evento (sem filtro de busca)
    total_evento = db.query(InscricaoGratuita).filter(InscricaoGratuita.evento_id == evento_id).count()
    presentes_evento = db.query(InscricaoGratuita).filter(
        InscricaoGratuita.evento_id == evento_id,
        InscricaoGratuita.checkin_realizado == True
    ).count()
    alocados_evento = db.query(InscricaoGratuita).filter(
        InscricaoGratuita.evento_id == evento_id,
        InscricaoGratuita.acomodacao_id.isnot(None)
    ).count()
    sem_acomodacao_evento = total_evento - alocados_evento

    return {
        "resumo": {
            "total": total_evento,
            "presentes": presentes_evento,
            "ausentes": max(0, total_evento - presentes_evento),
            "alocados": alocados_evento,
            "sem_acomodacao": max(0, sem_acomodacao_evento)
        },
        "itens": [_serializar_gratuita(g) for g in itens]
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def criar_inscricao_gratuita(
    evento_id: int,
    req: GratuitaCreate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_admin_global)
) -> Dict[str, Any]:
    """Cadastra um participante manual com gratuidade para o evento."""
    _obter_evento_ou_404(db, evento_id)

    nome_clean = (req.nome or "").strip()
    if not nome_clean:
        raise HTTPException(status_code=400, detail="O nome do participante é obrigatório.")

    # Gerar código de check-in único
    codigo_checkin = f"GRAT-EV{evento_id}-{uuid.uuid4().hex[:8].upper()}"

    nova = InscricaoGratuita(
        evento_id=evento_id,
        nome=nome_clean,
        contato=(req.contato or "").strip() or None,
        sexo=(req.sexo or "").strip() or None,
        observacao=(req.observacao or "").strip() or None,
        codigo_checkin=codigo_checkin,
        checkin_realizado=False,
        checkin_data=None,
        acomodacao_id=None
    )
    db.add(nova)
    db.commit()
    db.refresh(nova)

    return {
        "sucesso": True,
        "mensagem": "Participante com gratuidade cadastrado com sucesso!",
        "item": _serializar_gratuita(nova)
    }


@router.put("/{gratuita_id}")
def atualizar_inscricao_gratuita(
    evento_id: int,
    gratuita_id: int,
    req: GratuitaUpdate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_admin_global)
) -> Dict[str, Any]:
    """Atualiza dados cadastrais de um participante com gratuidade."""
    _obter_evento_ou_404(db, evento_id)

    reg = db.query(InscricaoGratuita).filter(
        InscricaoGratuita.id == gratuita_id,
        InscricaoGratuita.evento_id == evento_id
    ).first()
    if not reg:
        raise HTTPException(status_code=404, detail="Inscrição gratuita não encontrada.")

    if req.nome is not None:
        nome_clean = req.nome.strip()
        if not nome_clean:
            raise HTTPException(status_code=400, detail="O nome não pode ficar vazio.")
        reg.nome = nome_clean

    if req.contato is not None:
        reg.contato = req.contato.strip() or None

    if req.sexo is not None:
        reg.sexo = req.sexo.strip() or None

    if req.observacao is not None:
        reg.observacao = req.observacao.strip() or None

    reg.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(reg)

    return {
        "sucesso": True,
        "mensagem": "Inscrição gratuita atualizada com sucesso!",
        "item": _serializar_gratuita(reg)
    }


@router.delete("/{gratuita_id}")
def excluir_inscricao_gratuita(
    evento_id: int,
    gratuita_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_admin_global)
) -> Dict[str, Any]:
    """Exclui a inscrição gratuita do participante."""
    _obter_evento_ou_404(db, evento_id)

    reg = db.query(InscricaoGratuita).filter(
        InscricaoGratuita.id == gratuita_id,
        InscricaoGratuita.evento_id == evento_id
    ).first()
    if not reg:
        raise HTTPException(status_code=404, detail="Inscrição gratuita não encontrada.")

    # Se for líder de quarto, remover liderança
    if reg.acomodacao_id:
        db.query(Acomodacao).filter(
            Acomodacao.id == reg.acomodacao_id,
            Acomodacao.lider_gratuita_id == reg.id
        ).update({"lider_gratuita_id": None}, synchronize_session=False)

    db.delete(reg)
    db.commit()

    return {
        "sucesso": True,
        "mensagem": f"Inscrição de '{reg.nome}' removida com sucesso."
    }


@router.post("/{gratuita_id}/toggle-checkin")
def toggle_checkin_gratuita(
    evento_id: int,
    gratuita_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("secretaria"))
) -> Dict[str, Any]:
    """Alterna o status de check-in de uma inscrição gratuita."""
    _obter_evento_ou_404(db, evento_id)

    reg = db.query(InscricaoGratuita).filter(
        InscricaoGratuita.id == gratuita_id,
        InscricaoGratuita.evento_id == evento_id
    ).first()
    if not reg:
        raise HTTPException(status_code=404, detail="Inscrição gratuita não encontrada.")

    if reg.checkin_realizado:
        reg.checkin_realizado = False
        reg.checkin_data = None
        msg = f"Check-in de '{reg.nome}' desfeito com sucesso."
    else:
        reg.checkin_realizado = True
        reg.checkin_data = datetime.utcnow()
        msg = f"Check-in de '{reg.nome}' confirmado com sucesso!"

    reg.updated_at = datetime.utcnow()
    db.commit()

    return {
        "sucesso": True,
        "checkin_realizado": reg.checkin_realizado,
        "checkin_data": reg.checkin_data.isoformat() if reg.checkin_data else None,
        "mensagem": msg
    }
