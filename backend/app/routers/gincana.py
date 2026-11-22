from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime

from app.core.database import get_db
from app.core.security import get_current_admin, require_permissao
from app.models.usuario import Usuario
from app.models.evento import Evento
from app.models.gincana import Gincana, GincanaPonto
from app.models.acomodacao import Acomodacao
from app.models.inscricao import Inscricao
from app.models.diaria import InscricaoDiaria
from collections import defaultdict
from app.schemas.gincana import (
    GincanaEquipeUpdate,
    GincanaVisibilidadeUpdate,
    GincanaPontoCreate,
    GincanaPontoResponse,
    GincanaDetalhesResponse,
    EquipeInfo,
)

router = APIRouter(tags=["Gincana"])

_TABELA_GINCANA_VERIFICADA = False


def _garantir_colunas_gincana(db: Session):
    global _TABELA_GINCANA_VERIFICADA
    if _TABELA_GINCANA_VERIFICADA:
        return
    try:
        from sqlalchemy import text
        db.execute(text("ALTER TABLE gincanas ADD COLUMN IF NOT EXISTS placar_oculto BOOLEAN DEFAULT FALSE NOT NULL;"))
        db.commit()
    except Exception:
        db.rollback()
    finally:
        _TABELA_GINCANA_VERIFICADA = True


def _verificar_se_eh_admin(request: Optional[Request], db: Session) -> bool:
    if not request:
        return False
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return False
    token = auth_header.split(" ")[1]
    try:
        from jose import jwt
        from app.core.config import settings
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            return False
        user = db.query(Usuario).filter(Usuario.id == int(user_id)).first()
        return bool(user and user.is_admin)
    except Exception:
        return False


def _obter_ou_criar_gincana_ativa(db: Session, evento_id: Optional[int] = None) -> Gincana:
    _garantir_colunas_gincana(db)
    query = db.query(Gincana).filter(Gincana.ativa == True)
    if evento_id is not None:
        query = query.filter(Gincana.evento_id == evento_id)
    
    gincana = query.order_by(Gincana.id.desc()).first()
    if not gincana:
        # Se não encontrar por evento, verificar se existe qualquer gincana ativa
        if evento_id is not None:
            gincana = db.query(Gincana).filter(Gincana.ativa == True).order_by(Gincana.id.desc()).first()

    if not gincana:
        # Criar gincana padrão inicial com a identidade do Acamp Sinodal
        gincana = Gincana(
            titulo="Gincana Acamp Sinodal",
            evento_id=evento_id,
            ativa=True,
            placar_oculto=False,
            nome_equipe_1="Equipe Verde",
            cor_equipe_1="#00B894",
            nome_equipe_2="Equipe Laranja",
            cor_equipe_2="#FF7900"
        )
        db.add(gincana)
        db.commit()
        db.refresh(gincana)

    return gincana


def _montar_resposta_gincana(gincana: Gincana, db: Session, evento_id_param: Optional[int] = None, is_admin: bool = False) -> GincanaDetalhesResponse:
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
                usuario_nome=p.usuario_nome,
                created_at=p.created_at
            )
        )

        # Resolucao dinamica do Evento vinculado
    target_evento_id = gincana.evento_id or evento_id_param
    if not target_evento_id:
        try:
            # 1. Prioriza o evento que possui acomodacoes cadastradas com cor definida
            ac_com_cor = db.query(Acomodacao).filter(Acomodacao.cor.isnot(None)).order_by(Acomodacao.id.desc()).first()
            if ac_com_cor and ac_com_cor.evento_id:
                target_evento_id = ac_com_cor.evento_id
            else:
                # 2. Busca o evento ativo mais recente ou qualquer evento
                ev_ativo = db.query(Evento).filter(Evento.ativo == True).order_by(Evento.id.desc()).first()
                if not ev_ativo:
                    ev_ativo = db.query(Evento).order_by(Evento.id.desc()).first()
                if ev_ativo:
                    target_evento_id = ev_ativo.id

            # Persistir o vinculo na gincana para consultas subsequentes
            if target_evento_id and not gincana.evento_id:
                gincana.evento_id = target_evento_id
                db.commit()
                db.refresh(gincana)
        except Exception:
            db.rollback()

    # Acomodacoes vinculadas as equipes (Verde = Equipe 1, Laranja = Equipe 2)
    quartos_eq1 = []
    vagas_eq1 = 0
    ocup_eq1 = 0
    quartos_eq2 = []
    vagas_eq2 = 0
    ocup_eq2 = 0

    try:
        query_ac = db.query(Acomodacao)
        if target_evento_id:
            query_ac = query_ac.filter(Acomodacao.evento_id == target_evento_id)
        acomodacoes = query_ac.all()

        ocupantes_map = defaultdict(int)
        query_ins = db.query(Inscricao.acomodacao_id).filter(
            Inscricao.status != "CANCELADA",
            Inscricao.acomodacao_id.isnot(None)
        )
        if target_evento_id:
            query_ins = query_ins.filter(Inscricao.evento_id == target_evento_id)
        for ins in query_ins.all():
            if ins[0]:
                ocupantes_map[ins[0]] += 1

        query_dia = db.query(InscricaoDiaria.acomodacao_id).filter(
            InscricaoDiaria.status != "CANCELADA",
            InscricaoDiaria.acomodacao_id.isnot(None)
        )
        if target_evento_id:
            query_dia = query_dia.filter(InscricaoDiaria.evento_id == target_evento_id)
        for dia in query_dia.all():
            if dia[0]:
                ocupantes_map[dia[0]] += 1

        eq1_cor = (gincana.cor_equipe_1 or "").strip().upper()
        eq2_cor = (gincana.cor_equipe_2 or "").strip().upper()
        eq1_nome = (gincana.nome_equipe_1 or "").strip().upper()
        eq2_nome = (gincana.nome_equipe_2 or "").strip().upper()

        for ac in acomodacoes:
            cor_norm = (ac.cor or "").strip().upper()
            if not cor_norm:
                continue
            c_ocup = ocupantes_map[ac.id]
            c_cap = int(ac.capacidade or 0)

            # Reconhecimento amplo e resiliente de cores / equipes
            if (
                cor_norm in ["VERDE", "GREEN", "#00B894", "1", "EQUIPE 1", "EQUIPE_1"]
                or cor_norm == eq1_cor
                or (cor_norm and cor_norm in eq1_nome)
                or ("VERDE" in eq1_nome and cor_norm == "VERDE")
            ):
                quartos_eq1.append(ac.nome)
                vagas_eq1 += c_cap
                ocup_eq1 += c_ocup
            elif (
                cor_norm in ["LARANJA", "ORANGE", "#FF7900", "2", "EQUIPE 2", "EQUIPE_2"]
                or cor_norm == eq2_cor
                or (cor_norm and cor_norm in eq2_nome)
                or ("LARANJA" in eq2_nome and cor_norm == "LARANJA")
            ):
                quartos_eq2.append(ac.nome)
                vagas_eq2 += c_cap
                ocup_eq2 += c_ocup
    except Exception as e:
        import logging
        logging.exception(f"Erro ao processar quartos vinculados na gincana: {e}")

    evento_titulo = None
    if target_evento_id:
        try:
            ev = db.query(Evento).filter(Evento.id == target_evento_id).first()
            if ev:
                evento_titulo = ev.titulo
        except Exception:
            pass

    placar_oculto = bool(getattr(gincana, "placar_oculto", False))

    if placar_oculto and not is_admin:
        # Modo Mistério para público: protege pontuações reais contra DevTools
        total_eq1_resp = 0
        total_eq2_resp = 0
        lider_resp = "misterio"
        diferenca_resp = 0
        total_geral_resp = 0
        pct1_resp = 50.0
        pct2_resp = 50.0
        historico_resp = []
        for p in historico:
            historico_resp.append(
                GincanaPontoResponse(
                    id=p.id,
                    equipe=p.equipe,
                    equipe_nome=p.equipe_nome,
                    equipe_cor=p.equipe_cor,
                    titulo=p.titulo,
                    descricao=p.descricao,
                    pontos=0,
                    usuario_nome=p.usuario_nome,
                    created_at=p.created_at
                )
            )
    else:
        total_eq1_resp = total_eq1
        total_eq2_resp = total_eq2
        lider_resp = lider
        diferenca_resp = abs(total_eq1 - total_eq2)
        total_geral_resp = total_geral
        pct1_resp = pct1
        pct2_resp = pct2
        historico_resp = historico

    return GincanaDetalhesResponse(
        id=gincana.id,
        titulo=gincana.titulo,
        evento_id=gincana.evento_id or target_evento_id,
        evento_titulo=evento_titulo,
        placar_oculto=placar_oculto,
        equipe_1=EquipeInfo(
            numero=1,
            nome=gincana.nome_equipe_1,
            cor=gincana.cor_equipe_1,
            pontos=total_eq1_resp,
            total_quartos=len(quartos_eq1),
            total_vagas_quartos=vagas_eq1,
            total_ocupantes_quartos=ocup_eq1,
            quartos_nomes=quartos_eq1
        ),
        equipe_2=EquipeInfo(
            numero=2,
            nome=gincana.nome_equipe_2,
            cor=gincana.cor_equipe_2,
            pontos=total_eq2_resp,
            total_quartos=len(quartos_eq2),
            total_vagas_quartos=vagas_eq2,
            total_ocupantes_quartos=ocup_eq2,
            quartos_nomes=quartos_eq2
        ),
        lider=lider_resp,
        diferenca_pontos=diferenca_resp,
        total_geral=total_geral_resp,
        porcentagem_eq1=pct1_resp,
        porcentagem_eq2=pct2_resp,
        historico=historico_resp,
        atualizado_em=datetime.utcnow()
    )


# ==============================================================
# Rotas Públicas (para o placar em tempo real)
# ==============================================================

@router.get("/gincana/ativa", response_model=GincanaDetalhesResponse)
def obter_gincana_ativa(
    request: Request,
    evento_id: Optional[int] = Query(None, description="Filtrar por ID do Evento"),
    db: Session = Depends(get_db)
):
    """Retorna os dados e pontuações em tempo real da gincana ativa."""
    gincana = _obter_ou_criar_gincana_ativa(db, evento_id)
    eh_admin = _verificar_se_eh_admin(request, db)
    return _montar_resposta_gincana(gincana, db, evento_id_param=evento_id, is_admin=eh_admin)


@router.get("/gincana/{gincana_id}", response_model=GincanaDetalhesResponse)
def obter_gincana_por_id(
    gincana_id: int,
    request: Request,
    db: Session = Depends(get_db)
):
    """Retorna os dados de uma gincana específica."""
    gincana = db.query(Gincana).filter(Gincana.id == gincana_id).first()
    if not gincana:
        raise HTTPException(status_code=404, detail="Gincana não encontrada.")
    eh_admin = _verificar_se_eh_admin(request, db)
    return _montar_resposta_gincana(gincana, db, is_admin=eh_admin)


# ==============================================================
# Rotas Administrativas (protegidas com token de admin)
# ==============================================================

@router.get("/admin/gincana/ativa", response_model=GincanaDetalhesResponse)
def obter_gincana_ativa_admin(
    evento_id: Optional[int] = Query(None, description="Filtrar por ID do Evento"),
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("gincana"))
):
    """Retorna os dados completos da gincana ativa para administradores (sempre visível)."""
    gincana = _obter_ou_criar_gincana_ativa(db, evento_id)
    return _montar_resposta_gincana(gincana, db, evento_id_param=evento_id, is_admin=True)


@router.put("/admin/gincana/{gincana_id}/visibilidade", response_model=GincanaDetalhesResponse)
def atualizar_visibilidade_placar(
    gincana_id: int,
    req: GincanaVisibilidadeUpdate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("gincana"))
):
    """Ativa ou desativa o modo mistério (placar oculto/borrado para o público)."""
    _garantir_colunas_gincana(db)
    gincana = db.query(Gincana).filter(Gincana.id == gincana_id).first()
    if not gincana:
        raise HTTPException(status_code=404, detail="Gincana não encontrada.")

    gincana.placar_oculto = bool(req.placar_oculto)
    db.commit()
    db.refresh(gincana)
    return _montar_resposta_gincana(gincana, db, is_admin=True)


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
    return _montar_resposta_gincana(gincana, db, is_admin=True)


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

    nome_usuario = admin.nome.strip() if admin and admin.nome else (admin.email if admin else "Administrador")
    novo_ponto = GincanaPonto(
        gincana_id=gincana.id,
        equipe=req.equipe,
        titulo=req.titulo.strip(),
        descricao=req.descricao.strip() if req.descricao else None,
        pontos=req.pontos,
        usuario_nome=nome_usuario
    )
    db.add(novo_ponto)
    db.commit()

    return _montar_resposta_gincana(gincana, db, is_admin=True)


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

    return _montar_resposta_gincana(gincana, db, is_admin=True)
