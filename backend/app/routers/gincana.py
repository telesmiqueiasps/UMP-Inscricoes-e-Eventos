from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime

from app.core.database import get_db
from app.core.security import get_current_admin, require_permissao
from app.models.usuario import Usuario
from app.models.evento import Evento
from app.models.gincana import Gincana, GincanaPonto
from app.schemas.gincana import (
    GincanaEquipeUpdate,
    GincanaPontoCreate,
    GincanaPontoResponse,
    GincanaDetalhesResponse,
    EquipeInfo,
)

router = APIRouter(tags=["Gincana"])


def _obter_ou_criar_gincana_ativa(db: Session, evento_id: Optional[int] = None) -> Gincana:
    query = db.query(Gincana).filter(Gincana.ativa == True)
    if evento_id is not None:
        query = query.filter(Gincana.evento_id == evento_id)
    
    gincana = query.order_by(Gincana.id.desc()).first()
    if not gincana:
        # Se não encontrar por evento, verificar se existe qualquer gincana ativa
        if evento_id is not None:
            gincana = db.query(Gincana).filter(Gincana.ativa == True).order_by(Gincana.id.desc()).first()

    if not gincana:
        # Criar gincana padrão inicial
        gincana = Gincana(
            titulo="Gincana UMP",
            evento_id=evento_id,
            ativa=True,
            nome_equipe_1="Equipe 1",
            cor_equipe_1="#2563EB",
            nome_equipe_2="Equipe 2",
            cor_equipe_2="#DC2626"
        )
        db.add(gincana)
        db.commit()
        db.refresh(gincana)

    return gincana


def _montar_resposta_gincana(gincana: Gincana, db: Session) -> GincanaDetalhesResponse:
    total_eq1 = (
        db.query(func.coalesce(func.sum(GincanaPonto.pontos), 0))
        .filter(GincanaPonto.gincana_id == gincana.id, GincanaPonto.equipe == 1)
        .scalar()
        or 0
    )
    total_eq2 = (
        db.query(func.coalesce(func.sum(GincanaPonto.pontos), 0))
        .filter(GincanaPonto.gincana_id == gincana.id, GincanaPonto.equipe == 2)
        .scalar()
        or 0
    )

    total_eq1 = int(total_eq1)
    total_eq2 = int(total_eq2)
    total_geral = total_eq1 + total_eq2

    # Cálculo da dominância na barra de progresso
    pts1_pos = max(0, total_eq1)
    pts2_pos = max(0, total_eq2)
    soma_positiva = pts1_pos + pts2_pos

    if soma_positiva > 0:
        pct1 = round((pts1_pos / soma_positiva) * 100, 1)
        pct2 = round(100.0 - pct1, 1)
    else:
        pct1 = 50.0
        pct2 = 50.0

    if total_eq1 > total_eq2:
        lider = 1
    elif total_eq2 > total_eq1:
        lider = 2
    else:
        lider = "empate"

    # Montar histórico ordenado por data mais recente
    pontos_db = (
        db.query(GincanaPonto)
        .filter(GincanaPonto.gincana_id == gincana.id)
        .order_by(GincanaPonto.created_at.desc(), GincanaPonto.id.desc())
        .limit(100)
        .all()
    )

    historico = []
    for p in pontos_db:
        eq_nome = gincana.nome_equipe_1 if p.equipe == 1 else gincana.nome_equipe_2
        eq_cor = gincana.cor_equipe_1 if p.equipe == 1 else gincana.cor_equipe_2
        historico.append(
            GincanaPontoResponse(
                id=p.id,
                equipe=p.equipe,
                equipe_nome=eq_nome,
                equipe_cor=eq_cor,
                titulo=p.titulo,
                descricao=p.descricao,
                pontos=p.pontos,
                created_at=p.created_at
            )
        )

    evento_titulo = None
    if gincana.evento_id:
        ev = db.query(Evento).filter(Evento.id == gincana.evento_id).first()
        if ev:
            evento_titulo = ev.titulo

    return GincanaDetalhesResponse(
        id=gincana.id,
        titulo=gincana.titulo,
        evento_id=gincana.evento_id,
        evento_titulo=evento_titulo,
        equipe_1=EquipeInfo(
            numero=1,
            nome=gincana.nome_equipe_1,
            cor=gincana.cor_equipe_1,
            pontos=total_eq1
        ),
        equipe_2=EquipeInfo(
            numero=2,
            nome=gincana.nome_equipe_2,
            cor=gincana.cor_equipe_2,
            pontos=total_eq2
        ),
        lider=lider,
        diferenca_pontos=abs(total_eq1 - total_eq2),
        total_geral=total_geral,
        porcentagem_eq1=pct1,
        porcentagem_eq2=pct2,
        historico=historico,
        atualizado_em=datetime.utcnow()
    )


# ==============================================================
# Rotas Públicas (para o placar em tempo real)
# ==============================================================

@router.get("/gincana/ativa", response_model=GincanaDetalhesResponse)
def obter_gincana_ativa(
    evento_id: Optional[int] = Query(None, description="Filtrar por ID do Evento"),
    db: Session = Depends(get_db)
):
    """Retorna os dados e pontuações em tempo real da gincana ativa."""
    gincana = _obter_ou_criar_gincana_ativa(db, evento_id)
    return _montar_resposta_gincana(gincana, db)


@router.get("/gincana/{gincana_id}", response_model=GincanaDetalhesResponse)
def obter_gincana_por_id(gincana_id: int, db: Session = Depends(get_db)):
    """Retorna os dados de uma gincana específica."""
    gincana = db.query(Gincana).filter(Gincana.id == gincana_id).first()
    if not gincana:
        raise HTTPException(status_code=404, detail="Gincana não encontrada.")
    return _montar_resposta_gincana(gincana, db)


# ==============================================================
# Rotas Administrativas (protegidas com token de admin)
# ==============================================================

@router.put("/admin/gincana/{gincana_id}/equipes", response_model=GincanaDetalhesResponse)
def atualizar_equipes_gincana(
    gincana_id: int,
    req: GincanaEquipeUpdate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("gincana"))
):
    """Atualiza nomes e cores das duas equipes da gincana."""
    gincana = db.query(Gincana).filter(Gincana.id == gincana_id).first()
    if not gincana:
        raise HTTPException(status_code=404, detail="Gincana não encontrada.")

    gincana.nome_equipe_1 = req.nome_equipe_1.strip()
    gincana.cor_equipe_1 = req.cor_equipe_1.strip()
    gincana.nome_equipe_2 = req.nome_equipe_2.strip()
    gincana.cor_equipe_2 = req.cor_equipe_2.strip()

    if req.titulo:
        gincana.titulo = req.titulo.strip()

    if req.evento_id is not None:
        gincana.evento_id = req.evento_id

    db.commit()
    db.refresh(gincana)
    return _montar_resposta_gincana(gincana, db)


@router.post("/admin/gincana/{gincana_id}/pontos", response_model=GincanaDetalhesResponse, status_code=status.HTTP_201_CREATED)
def lancar_pontos_tarefa(
    gincana_id: int,
    req: GincanaPontoCreate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("gincana"))
):
    """Lança pontuação de uma tarefa para a Equipe 1 ou Equipe 2."""
    gincana = db.query(Gincana).filter(Gincana.id == gincana_id).first()
    if not gincana:
        raise HTTPException(status_code=404, detail="Gincana não encontrada.")

    novo_ponto = GincanaPonto(
        gincana_id=gincana.id,
        equipe=req.equipe,
        titulo=req.titulo.strip(),
        descricao=req.descricao.strip() if req.descricao else None,
        pontos=req.pontos
    )
    db.add(novo_ponto)
    db.commit()

    return _montar_resposta_gincana(gincana, db)


@router.delete("/admin/gincana/pontos/{ponto_id}")
def remover_ponto_tarefa(
    ponto_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("gincana"))
):
    """Remove um lançamento de ponto específico."""
    ponto = db.query(GincanaPonto).filter(GincanaPonto.id == ponto_id).first()
    if not ponto:
        raise HTTPException(status_code=404, detail="Registro de pontuação não encontrado.")

    gincana_id = ponto.gincana_id
    db.delete(ponto)
    db.commit()

    gincana = db.query(Gincana).filter(Gincana.id == gincana_id).first()
    return {"message": "Ponto removido com sucesso.", "gincana_id": gincana_id}


@router.post("/admin/gincana/{gincana_id}/zerar", response_model=GincanaDetalhesResponse)
def zerar_pontuacao_gincana(
    gincana_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("gincana"))
):
    """Zera todos os lançamentos de pontos da gincana selecionada."""
    gincana = db.query(Gincana).filter(Gincana.id == gincana_id).first()
    if not gincana:
        raise HTTPException(status_code=404, detail="Gincana não encontrada.")

    db.query(GincanaPonto).filter(GincanaPonto.gincana_id == gincana.id).delete()
    db.commit()
    db.refresh(gincana)

    return _montar_resposta_gincana(gincana, db)
