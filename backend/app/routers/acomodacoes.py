from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import Dict, Any, List

from app.core.database import get_db
from app.core.security import require_admin_global, require_permissao
from app.models.usuario import Usuario
from app.models.evento import Evento
from app.models.inscricao import Inscricao
from app.models.diaria import InscricaoDiaria
from app.models.acomodacao import Acomodacao
from app.schemas.acomodacao import (
    AcomodacaoCreate,
    AcomodacaoUpdate,
    AcomodacaoAlocarRequest,
    AcomodacaoDesalocarRequest
)

router = APIRouter(prefix="/admin/eventos/{evento_id}/acomodacoes", tags=["Acomodações"])


def _serializar_participante(reg: Any, tipo: str) -> Dict[str, Any]:
    """Serializa uma inscrição regular ou diária para exibição na gestão de acomodações."""
    usuario = reg.usuario
    extras = reg.dados_extras if isinstance(reg.dados_extras, dict) else {}
    return {
        "registro_id": reg.id,
        "tipo": tipo,
        "tipo_label": "Diária" if tipo == "DIARIA" else "Integral",
        "usuario_id": reg.usuario_id,
        "nome": usuario.nome if usuario else "Participante",
        "email": usuario.email if usuario else "",
        "telefone": (usuario.telefone if usuario and usuario.telefone else extras.get("telefone")) or "",
        "genero": extras.get("genero") or "",
        "igreja": extras.get("igreja") or "",
        "status": reg.status,
        "checkin_realizado": bool(reg.checkin_realizado),
        "acomodacao_id": reg.acomodacao_id
    }


def _obter_evento_ou_404(db: Session, evento_id: int) -> Evento:
    evento = db.query(Evento).filter(Evento.id == evento_id).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")
    return evento


@router.get("")
def listar_acomodacoes_evento(
    evento_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("secretaria"))
) -> Dict[str, Any]:
    """Lista todas as acomodações do evento, seus ocupantes e inscritos ainda sem alocação."""
    _obter_evento_ou_404(db, evento_id)

    acomodacoes = (
        db.query(Acomodacao)
        .filter(Acomodacao.evento_id == evento_id)
        .order_by(Acomodacao.nome.asc())
        .all()
    )

    inscricoes = (
        db.query(Inscricao)
        .options(joinedload(Inscricao.usuario))
        .filter(Inscricao.evento_id == evento_id, Inscricao.status != "CANCELADA")
        .all()
    )
    diarias = (
        db.query(InscricaoDiaria)
        .options(joinedload(InscricaoDiaria.usuario))
        .filter(InscricaoDiaria.evento_id == evento_id, InscricaoDiaria.status != "CANCELADA")
        .all()
    )

    ocupantes_por_acomodacao: Dict[int, List[Dict[str, Any]]] = {ac.id: [] for ac in acomodacoes}
    sem_acomodacao: List[Dict[str, Any]] = []

    for reg, tipo in [(i, "REGULAR") for i in inscricoes] + [(d, "DIARIA") for d in diarias]:
        item = _serializar_participante(reg, tipo)
        if reg.acomodacao_id and reg.acomodacao_id in ocupantes_por_acomodacao:
            ocupantes_por_acomodacao[reg.acomodacao_id].append(item)
        else:
            sem_acomodacao.append(item)

    sem_acomodacao.sort(key=lambda x: (x["nome"] or "").lower())

    acomodacoes_data = []
    capacidade_total = 0
    total_alocados = 0

    for ac in acomodacoes:
        ocupantes = sorted(ocupantes_por_acomodacao.get(ac.id, []), key=lambda x: (x["nome"] or "").lower())
        ocupados_count = len(ocupantes)
        cap = int(ac.capacidade or 0)
        capacidade_total += cap
        total_alocados += ocupados_count
        acomodacoes_data.append({
            "id": ac.id,
            "evento_id": ac.evento_id,
            "nome": ac.nome,
            "tipo": ac.tipo,
            "capacidade": cap,
            "genero_restrito": ac.genero_restrito,
            "descricao": ac.descricao,
            "ocupados_count": ocupados_count,
            "vagas_restantes": max(0, cap - ocupados_count) if cap > 0 else None,
            "ocupantes": ocupantes
        })

    return {
        "acomodacoes": acomodacoes_data,
        "sem_acomodacao": sem_acomodacao,
        "resumo": {
            "total_acomodacoes": len(acomodacoes_data),
            "capacidade_total": capacidade_total,
            "total_alocados": total_alocados,
            "total_sem_acomodacao": len(sem_acomodacao)
        }
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def criar_acomodacao(
    evento_id: int,
    req: AcomodacaoCreate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_admin_global)
):
    """Cria uma nova acomodação (quarto ou local de hospedagem) para o evento."""
    _obter_evento_ou_404(db, evento_id)

    nome_clean = (req.nome or "").strip()
    if not nome_clean:
        raise HTTPException(status_code=400, detail="Informe o nome da acomodação.")

    nova = Acomodacao(
        evento_id=evento_id,
        nome=nome_clean,
        tipo=(req.tipo or "Quarto").strip(),
        capacidade=max(0, int(req.capacidade or 0)),
        genero_restrito=(req.genero_restrito or "").strip().upper() or None,
        descricao=(req.descricao or "").strip() or None
    )
    db.add(nova)
    db.commit()
    db.refresh(nova)
    return {"id": nova.id, "nome": nova.nome, "mensagem": "Acomodação criada com sucesso."}


@router.put("/{acomodacao_id}")
def atualizar_acomodacao(
    evento_id: int,
    acomodacao_id: int,
    req: AcomodacaoUpdate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_admin_global)
):
    """Atualiza os dados de uma acomodação do evento."""
    ac = db.query(Acomodacao).filter(
        Acomodacao.id == acomodacao_id,
        Acomodacao.evento_id == evento_id
    ).first()
    if not ac:
        raise HTTPException(status_code=404, detail="Acomodação não encontrada.")

    if req.nome is not None:
        nome_clean = req.nome.strip()
        if not nome_clean:
            raise HTTPException(status_code=400, detail="O nome da acomodação não pode ficar vazio.")
        ac.nome = nome_clean
    if req.tipo is not None:
        ac.tipo = req.tipo.strip() or "Quarto"
    if req.capacidade is not None:
        ac.capacidade = max(0, int(req.capacidade))
    if req.genero_restrito is not None:
        ac.genero_restrito = req.genero_restrito.strip().upper() or None
    if req.descricao is not None:
        ac.descricao = req.descricao.strip() or None

    db.commit()
    db.refresh(ac)
    return {"id": ac.id, "nome": ac.nome, "mensagem": "Acomodação atualizada com sucesso."}


@router.delete("/{acomodacao_id}")
def excluir_acomodacao(
    evento_id: int,
    acomodacao_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_admin_global)
):
    """Exclui uma acomodação e desvincula os inscritos que estavam nela."""
    ac = db.query(Acomodacao).filter(
        Acomodacao.id == acomodacao_id,
        Acomodacao.evento_id == evento_id
    ).first()
    if not ac:
        raise HTTPException(status_code=404, detail="Acomodação não encontrada.")

    db.query(Inscricao).filter(Inscricao.acomodacao_id == ac.id).update({"acomodacao_id": None}, synchronize_session=False)
    db.query(InscricaoDiaria).filter(InscricaoDiaria.acomodacao_id == ac.id).update({"acomodacao_id": None}, synchronize_session=False)
    db.delete(ac)
    db.commit()
    return {"sucesso": True, "mensagem": "Acomodação removida com sucesso."}


@router.post("/{acomodacao_id}/alocar")
def alocar_inscritos_acomodacao(
    evento_id: int,
    acomodacao_id: int,
    req: AcomodacaoAlocarRequest,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_admin_global)
):
    """Aloca um ou mais inscritos (integrais ou diárias) à acomodação informada."""
    ac = db.query(Acomodacao).filter(
        Acomodacao.id == acomodacao_id,
        Acomodacao.evento_id == evento_id
    ).first()
    if not ac:
        raise HTTPException(status_code=404, detail="Acomodação não encontrada.")

    inscricao_ids = list(set(req.inscricao_ids or []))
    diaria_ids = list(set(req.diaria_ids or []))
    if not inscricao_ids and not diaria_ids:
        raise HTTPException(status_code=400, detail="Selecione pelo menos um participante para alocar.")

    inscricoes_alvo = []
    if inscricao_ids:
        inscricoes_alvo = db.query(Inscricao).filter(
            Inscricao.evento_id == evento_id,
            Inscricao.id.in_(inscricao_ids),
            Inscricao.status != "CANCELADA"
        ).all()

    diarias_alvo = []
    if diaria_ids:
        diarias_alvo = db.query(InscricaoDiaria).filter(
            InscricaoDiaria.evento_id == evento_id,
            InscricaoDiaria.id.in_(diaria_ids),
            InscricaoDiaria.status != "CANCELADA"
        ).all()

    # Contar ocupação atual excluindo os que já estão nesta acomodação
    ocupados_reg = db.query(Inscricao).filter(
        Inscricao.evento_id == evento_id,
        Inscricao.acomodacao_id == ac.id,
        Inscricao.status != "CANCELADA"
    ).count()
    ocupados_dia = db.query(InscricaoDiaria).filter(
        InscricaoDiaria.evento_id == evento_id,
        InscricaoDiaria.acomodacao_id == ac.id,
        InscricaoDiaria.status != "CANCELADA"
    ).count()

    novos = sum(1 for r in inscricoes_alvo if r.acomodacao_id != ac.id) + sum(1 for d in diarias_alvo if d.acomodacao_id != ac.id)
    ocupacao_final = ocupados_reg + ocupados_dia + novos

    if ac.capacidade and ac.capacidade > 0 and ocupacao_final > ac.capacidade:
        raise HTTPException(
            status_code=400,
            detail=f"Capacidade máxima da acomodação '{ac.nome}' ({ac.capacidade} vagas) seria excedida ({ocupacao_final}/{ac.capacidade})."
        )

    for r in inscricoes_alvo:
        r.acomodacao_id = ac.id
    for d in diarias_alvo:
        d.acomodacao_id = ac.id

    db.commit()
    return {
        "sucesso": True,
        "alocados": len(inscricoes_alvo) + len(diarias_alvo),
        "mensagem": "Participante(s) alocado(s) com sucesso!"
    }


@router.post("/desalocar")
def desalocar_inscrito_acomodacao(
    evento_id: int,
    req: AcomodacaoDesalocarRequest,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_admin_global)
):
    """Remove a acomodação vinculada a um inscrito."""
    tipo = (req.tipo or "REGULAR").upper().strip()
    modelo = InscricaoDiaria if tipo == "DIARIA" else Inscricao

    reg = db.query(modelo).filter(
        modelo.id == req.registro_id,
        modelo.evento_id == evento_id
    ).first()
    if not reg:
        raise HTTPException(status_code=404, detail="Inscrição não encontrada.")

    reg.acomodacao_id = None
    db.commit()
    return {"sucesso": True, "mensagem": "Participante removido da acomodação."}

