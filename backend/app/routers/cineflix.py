import os
import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import text, or_, desc

from app.core.config import settings
from app.core.database import get_db, engine, Base
from app.core.security import get_current_admin, get_current_user
from app.models.usuario import Usuario
from app.models.evento import Evento
from app.models.cineflix import CineflixConfig, CineflixFantasia, CineflixVoto
from app.schemas.cineflix import (
    FantasiaCreate,
    PublicInscricaoFantasia,
    FantasiaUpdate,
    VotoJuradoSubmit,
    CineflixConfigUpdate,
    FantasiaResponse,
    RankingItemResponse,
    CineflixConfigResponse,
    VotoJuradoResponse,
    SequenciaDesfilePayload,
    AtivarPalcoPayload
)

router = APIRouter(tags=["Cineflix"])

_TABELAS_CINEFLIX_VERIFICADAS = False


def _garantir_tabelas_cineflix():
    global _TABELAS_CINEFLIX_VERIFICADAS
    if _TABELAS_CINEFLIX_VERIFICADAS:
        return
    try:
        Base.metadata.create_all(
            bind=engine,
            tables=[CineflixConfig.__table__, CineflixFantasia.__table__, CineflixVoto.__table__]
        )
        with engine.connect() as conn:
            try:
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS cineflix_configs (
                        evento_id INTEGER PRIMARY KEY REFERENCES eventos(id) ON DELETE CASCADE,
                        votacao_aberta BOOLEAN DEFAULT TRUE NOT NULL,
                        fantasia_ativa_id INTEGER,
                        token_jurado_1 VARCHAR(64) NOT NULL,
                        nome_jurado_1 VARCHAR(100) DEFAULT 'Jurado 1' NOT NULL,
                        token_jurado_2 VARCHAR(64) NOT NULL,
                        nome_jurado_2 VARCHAR(100) DEFAULT 'Jurado 2' NOT NULL,
                        token_jurado_3 VARCHAR(64) NOT NULL,
                        nome_jurado_3 VARCHAR(100) DEFAULT 'Jurado 3' NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                """))
                conn.execute(text("ALTER TABLE cineflix_configs ADD COLUMN IF NOT EXISTS fantasia_ativa_id INTEGER;"))
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS cineflix_fantasias (
                        id SERIAL PRIMARY KEY,
                        evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
                        usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
                        nome_participante VARCHAR(150) NOT NULL,
                        personagem VARCHAR(150) NOT NULL,
                        universo VARCHAR(150) NOT NULL,
                        descricao TEXT,
                        foto_url TEXT,
                        ordem_apresentacao INTEGER DEFAULT 0 NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                """))
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS cineflix_votos (
                        id SERIAL PRIMARY KEY,
                        evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
                        fantasia_id INTEGER NOT NULL REFERENCES cineflix_fantasias(id) ON DELETE CASCADE,
                        numero_jurado INTEGER NOT NULL,
                        nota_impacto_visual FLOAT DEFAULT 0.0 NOT NULL,
                        nota_performance FLOAT DEFAULT 0.0 NOT NULL,
                        nota_dedicacao FLOAT DEFAULT 0.0 NOT NULL,
                        observacao TEXT,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        CONSTRAINT uq_cineflix_fantasia_jurado UNIQUE (fantasia_id, numero_jurado)
                    );
                """))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cineflix_fantasias_ev ON cineflix_fantasias(evento_id);"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cineflix_votos_fantasia ON cineflix_votos(fantasia_id);"))
                conn.commit()
            except Exception:
                pass
        _TABELAS_CINEFLIX_VERIFICADAS = True
    except Exception:
        pass


def _obter_ou_criar_config(evento_id: int, db: Session) -> CineflixConfig:
    _garantir_tabelas_cineflix()
    cfg = db.query(CineflixConfig).filter(CineflixConfig.evento_id == evento_id).first()
    if not cfg:
        cfg = CineflixConfig(
            evento_id=evento_id,
            votacao_aberta=True,
            token_jurado_1=uuid.uuid4().hex[:16],
            nome_jurado_1="Jurado 1",
            token_jurado_2=uuid.uuid4().hex[:16],
            nome_jurado_2="Jurado 2",
            token_jurado_3=uuid.uuid4().hex[:16],
            nome_jurado_3="Jurado 3"
        )
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def _formatar_fantasia(f: CineflixFantasia, cfg: Optional[CineflixConfig] = None) -> Dict[str, Any]:
    nomes_jurados = {
        1: cfg.nome_jurado_1 if cfg else "Jurado 1",
        2: cfg.nome_jurado_2 if cfg else "Jurado 2",
        3: cfg.nome_jurado_3 if cfg else "Jurado 3"
    }

    votos_res = []
    total_pontos = 0.0
    for v in (f.votos or []):
        voto_total = round(v.nota_impacto_visual + v.nota_performance + v.nota_dedicacao, 2)
        total_pontos += voto_total
        votos_res.append({
            "numero_jurado": v.numero_jurado,
            "nome_jurado": nomes_jurados.get(v.numero_jurado, f"Jurado {v.numero_jurado}"),
            "nota_impacto_visual": v.nota_impacto_visual,
            "nota_performance": v.nota_performance,
            "nota_dedicacao": v.nota_dedicacao,
            "total": voto_total,
            "observacao": v.observacao,
            "updated_at": v.updated_at.isoformat() if v.updated_at else None
        })

    votos_count = len(votos_res)
    media_pontos = round(total_pontos / votos_count, 2) if votos_count > 0 else 0.0

    return {
        "id": f.id,
        "evento_id": f.evento_id,
        "evento_nome": f.evento.titulo if f.evento else "Geral",
        "usuario_id": f.usuario_id,
        "nome_participante": f.nome_participante,
        "personagem": f.personagem,
        "universo": f.universo,
        "descricao": f.descricao,
        "foto_url": f.foto_url,
        "ordem_apresentacao": f.ordem_apresentacao,
        "votos": votos_res,
        "total_pontos": round(total_pontos, 2),
        "media_pontos": media_pontos,
        "votos_recebidos": votos_count,
        "created_at": f.created_at.isoformat() if f.created_at else None
    }


# ==============================================================
# ENDPOINTS ADMINISTRATIVOS (Requer Admin)
# ==============================================================

@router.get("/admin/cineflix", response_model=List[Dict[str, Any]])
def listar_fantasias_admin(
    evento_id: Optional[int] = Query(None),
    q: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin_user: Usuario = Depends(get_current_admin)
):
    _garantir_tabelas_cineflix()
    query = db.query(CineflixFantasia)
    if evento_id:
        query = query.filter(CineflixFantasia.evento_id == evento_id)
    if q:
        termo = f"%{q.strip()}%"
        query = query.filter(
            or_(
                CineflixFantasia.nome_participante.ilike(termo),
                CineflixFantasia.personagem.ilike(termo),
                CineflixFantasia.universo.ilike(termo)
            )
        )

    fantasias = query.order_by(CineflixFantasia.ordem_apresentacao.asc(), CineflixFantasia.id.asc()).all()
    
    cfg_cache = {}
    res = []
    for f in fantasias:
        if f.evento_id not in cfg_cache:
            cfg_cache[f.evento_id] = db.query(CineflixConfig).filter(CineflixConfig.evento_id == f.evento_id).first()
        res.append(_formatar_fantasia(f, cfg_cache[f.evento_id]))
    return res


@router.post("/admin/cineflix", status_code=status.HTTP_201_CREATED)
def criar_fantasia_admin(
    dados: FantasiaCreate,
    db: Session = Depends(get_db),
    admin_user: Usuario = Depends(get_current_admin)
):
    _garantir_tabelas_cineflix()
    evento = db.query(Evento).filter(Evento.id == dados.evento_id).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    nome = (dados.nome_participante or "").strip()
    if not nome:
        raise HTTPException(status_code=400, detail="Nome do participante é obrigatório.")

    nova = CineflixFantasia(
        evento_id=dados.evento_id,
        nome_participante=nome,
        personagem=dados.personagem.strip(),
        universo=dados.universo.strip(),
        descricao=dados.descricao.strip() if dados.descricao else None,
        foto_url=dados.foto_url.strip() if dados.foto_url else None
    )
    db.add(nova)
    db.commit()
    db.refresh(nova)

    cfg = _obter_ou_criar_config(nova.evento_id, db)
    return _formatar_fantasia(nova, cfg)


@router.get("/admin/cineflix/config", response_model=CineflixConfigResponse)
def obter_config_cineflix_admin(
    evento_id: int = Query(...),
    db: Session = Depends(get_db),
    admin_user: Usuario = Depends(get_current_admin)
):
    _garantir_tabelas_cineflix()
    evento = db.query(Evento).filter(Evento.id == evento_id).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    cfg = _obter_ou_criar_config(evento_id, db)

    total_fantasias = db.query(CineflixFantasia).filter(CineflixFantasia.evento_id == evento_id).count()

    # Contagem de avaliações por jurado
    votos_j1 = db.query(CineflixVoto).filter(CineflixVoto.evento_id == evento_id, CineflixVoto.numero_jurado == 1).count()
    votos_j2 = db.query(CineflixVoto).filter(CineflixVoto.evento_id == evento_id, CineflixVoto.numero_jurado == 2).count()
    votos_j3 = db.query(CineflixVoto).filter(CineflixVoto.evento_id == evento_id, CineflixVoto.numero_jurado == 3).count()

    # Fantasia ativa no palco agora
    fantasia_ativa_dict = None
    votou_ativa_j1 = False
    votou_ativa_j2 = False
    votou_ativa_j3 = False

    if cfg.fantasia_ativa_id:
        f_ativa = db.query(CineflixFantasia).filter(
            CineflixFantasia.id == cfg.fantasia_ativa_id,
            CineflixFantasia.evento_id == evento_id
        ).first()
        if f_ativa:
            fantasia_ativa_dict = _formatar_fantasia(f_ativa, cfg)
            # Buscar votos dos jurados nesta fantasia ativa
            votos_ativa = db.query(CineflixVoto.numero_jurado).filter(CineflixVoto.fantasia_id == f_ativa.id).all()
            nums = {n for (n,) in votos_ativa}
            votou_ativa_j1 = 1 in nums
            votou_ativa_j2 = 2 in nums
            votou_ativa_j3 = 3 in nums
        else:
            cfg.fantasia_ativa_id = None
            db.commit()

    return {
        "evento_id": cfg.evento_id,
        "evento_nome": evento.titulo,
        "votacao_aberta": cfg.votacao_aberta,
        "fantasia_ativa_id": cfg.fantasia_ativa_id,
        "fantasia_ativa": fantasia_ativa_dict,
        "jurado_1": {
            "numero": 1,
            "nome": cfg.nome_jurado_1,
            "token": cfg.token_jurado_1,
            "votos_computados": votos_j1,
            "total_fantasias": total_fantasias,
            "votou_ativa": votou_ativa_j1
        },
        "jurado_2": {
            "numero": 2,
            "nome": cfg.nome_jurado_2,
            "token": cfg.token_jurado_2,
            "votos_computados": votos_j2,
            "total_fantasias": total_fantasias,
            "votou_ativa": votou_ativa_j2
        },
        "jurado_3": {
            "numero": 3,
            "nome": cfg.nome_jurado_3,
            "token": cfg.token_jurado_3,
            "votos_computados": votos_j3,
            "total_fantasias": total_fantasias,
            "votou_ativa": votou_ativa_j3
        },
        "total_fantasias": total_fantasias,
        "total_avaliadas": min(votos_j1, votos_j2, votos_j3)
    }


@router.put("/admin/cineflix/ativar-palco")
def ativar_fantasia_palco_admin(
    dados: AtivarPalcoPayload,
    db: Session = Depends(get_db),
    admin_user: Usuario = Depends(get_current_admin)
):
    _garantir_tabelas_cineflix()
    cfg = _obter_ou_criar_config(dados.evento_id, db)

    if dados.fantasia_id is not None:
        fantasia = db.query(CineflixFantasia).filter(
            CineflixFantasia.id == dados.fantasia_id,
            CineflixFantasia.evento_id == dados.evento_id
        ).first()
        if not fantasia:
            raise HTTPException(status_code=404, detail="Fantasia não encontrada neste evento.")
        cfg.fantasia_ativa_id = fantasia.id
        msg = f"{fantasia.personagem} ({fantasia.nome_participante}) está agora no palco para votação!"
    else:
        cfg.fantasia_ativa_id = None
        msg = "Palco liberado. Nenhuma fantasia está ativa para votação no momento."

    db.commit()
    db.refresh(cfg)
    return {
        "mensagem": msg,
        "fantasia_ativa_id": cfg.fantasia_ativa_id
    }


@router.put("/admin/cineflix/sequencia")
def definir_sequencia_desfile_admin(
    dados: SequenciaDesfilePayload,
    db: Session = Depends(get_db),
    admin_user: Usuario = Depends(get_current_admin)
):
    _garantir_tabelas_cineflix()
    for item in dados.sequencia:
        db.query(CineflixFantasia).filter(
            CineflixFantasia.id == item.id,
            CineflixFantasia.evento_id == dados.evento_id
        ).update({"ordem_apresentacao": item.ordem})

    db.commit()
    return {"mensagem": "Sequência de desfile atualizada com sucesso!"}


@router.put("/admin/cineflix/config")
def atualizar_config_cineflix_admin(
    evento_id: int = Query(...),
    dados: CineflixConfigUpdate = ...,
    db: Session = Depends(get_db),
    admin_user: Usuario = Depends(get_current_admin)
):
    _garantir_tabelas_cineflix()
    cfg = _obter_ou_criar_config(evento_id, db)

    if dados.votacao_aberta is not None:
        cfg.votacao_aberta = dados.votacao_aberta
    if dados.nome_jurado_1 is not None:
        cfg.nome_jurado_1 = dados.nome_jurado_1.strip()
    if dados.nome_jurado_2 is not None:
        cfg.nome_jurado_2 = dados.nome_jurado_2.strip()
    if dados.nome_jurado_3 is not None:
        cfg.nome_jurado_3 = dados.nome_jurado_3.strip()

    if dados.regenerar_tokens:
        cfg.token_jurado_1 = uuid.uuid4().hex[:16]
        cfg.token_jurado_2 = uuid.uuid4().hex[:16]
        cfg.token_jurado_3 = uuid.uuid4().hex[:16]

    db.commit()
    db.refresh(cfg)
    return {"mensagem": "Configurações atualizadas com sucesso."}


@router.get("/admin/cineflix/ranking", response_model=List[RankingItemResponse])
def obter_ranking_cineflix(
    evento_id: int = Query(...),
    db: Session = Depends(get_db),
    admin_user: Usuario = Depends(get_current_admin)
):
    _garantir_tabelas_cineflix()
    fantasias = db.query(CineflixFantasia).filter(CineflixFantasia.evento_id == evento_id).all()
    cfg = _obter_ou_criar_config(evento_id, db)

    itens = []
    for f in fantasias:
        votos_map = {v.numero_jurado: v for v in (f.votos or [])}
        
        v1 = votos_map.get(1)
        v2 = votos_map.get(2)
        v3 = votos_map.get(3)

        tot_j1 = round(v1.nota_impacto_visual + v1.nota_performance + v1.nota_dedicacao, 2) if v1 else None
        tot_j2 = round(v2.nota_impacto_visual + v2.nota_performance + v2.nota_dedicacao, 2) if v2 else None
        tot_j3 = round(v3.nota_impacto_visual + v3.nota_performance + v3.nota_dedicacao, 2) if v3 else None

        notas_validas = [n for n in [tot_j1, tot_j2, tot_j3] if n is not None]
        soma_total = round(sum(notas_validas), 2)
        media = round(soma_total / len(notas_validas), 2) if notas_validas else 0.0

        itens.append({
            "posicao": 0,
            "fantasia_id": f.id,
            "nome_participante": f.nome_participante,
            "personagem": f.personagem,
            "universo": f.universo,
            "foto_url": f.foto_url,
            "nota_j1": tot_j1,
            "nota_j2": tot_j2,
            "nota_j3": tot_j3,
            "pontuacao_total": soma_total,
            "media_final": media,
            "total_avaliacoes": len(notas_validas),
            "detalhes_j1": {
                "impacto": v1.nota_impacto_visual,
                "performance": v1.nota_performance,
                "dedicacao": v1.nota_dedicacao,
                "obs": v1.observacao
            } if v1 else None,
            "detalhes_j2": {
                "impacto": v2.nota_impacto_visual,
                "performance": v2.nota_performance,
                "dedicacao": v2.nota_dedicacao,
                "obs": v2.observacao
            } if v2 else None,
            "detalhes_j3": {
                "impacto": v3.nota_impacto_visual,
                "performance": v3.nota_performance,
                "dedicacao": v3.nota_dedicacao,
                "obs": v3.observacao
            } if v3 else None
        })

    # Ordenar por pontuação total decrescente (e desempate por média ou total de avaliações)
    itens.sort(key=lambda x: (x["pontuacao_total"], x["media_final"]), reverse=True)
    for idx, it in enumerate(itens, 1):
        it["posicao"] = idx

    return itens


@router.put("/admin/cineflix/{id}")
def atualizar_fantasia_admin(
    id: int,
    dados: FantasiaUpdate,
    db: Session = Depends(get_db),
    admin_user: Usuario = Depends(get_current_admin)
):
    _garantir_tabelas_cineflix()
    fantasia = db.query(CineflixFantasia).filter(CineflixFantasia.id == id).first()
    if not fantasia:
        raise HTTPException(status_code=404, detail="Fantasia não encontrada.")

    if dados.nome_participante is not None:
        fantasia.nome_participante = dados.nome_participante.strip()
    if dados.personagem is not None:
        fantasia.personagem = dados.personagem.strip()
    if dados.universo is not None:
        fantasia.universo = dados.universo.strip()
    if dados.descricao is not None:
        fantasia.descricao = dados.descricao.strip() if dados.descricao else None
    if dados.foto_url is not None:
        fantasia.foto_url = dados.foto_url.strip() if dados.foto_url else None
    if dados.ordem_apresentacao is not None:
        fantasia.ordem_apresentacao = dados.ordem_apresentacao

    db.commit()
    db.refresh(fantasia)

    cfg = _obter_ou_criar_config(fantasia.evento_id, db)
    return _formatar_fantasia(fantasia, cfg)


@router.delete("/admin/cineflix/{id}")
def excluir_fantasia_admin(
    id: int,
    db: Session = Depends(get_db),
    admin_user: Usuario = Depends(get_current_admin)
):
    _garantir_tabelas_cineflix()
    fantasia = db.query(CineflixFantasia).filter(CineflixFantasia.id == id).first()
    if not fantasia:
        raise HTTPException(status_code=404, detail="Fantasia não encontrada.")

    db.delete(fantasia)
    db.commit()
    return {"mensagem": "Fantasia excluída com sucesso."}


@router.post("/admin/cineflix/upload")
@router.post("/usuario/cineflix/upload")
async def upload_foto_fantasia(
    file: UploadFile = File(...),
    current_user: Usuario = Depends(get_current_user)
):
    import httpx
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="O arquivo deve ser uma imagem válida.")

    content = await file.read()
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="A imagem deve ter no máximo 15MB.")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if not ext or ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        ext = ".jpg"

    nome_arquivo = f"cineflix/{uuid.uuid4()}{ext}"

    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        raise HTTPException(status_code=500, detail="Supabase Storage não configurado.")

    clean_url = settings.SUPABASE_URL.rstrip('/')
    bucket = settings.SUPABASE_BUCKET or "eventos"
    upload_url = f"{clean_url}/storage/v1/object/{bucket}/{nome_arquivo}"

    headers = {
        "Authorization": f"Bearer {settings.SUPABASE_KEY}",
        "Content-Type": file.content_type
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(upload_url, headers=headers, content=content)
            if resp.status_code not in (200, 201):
                raise HTTPException(status_code=500, detail=f"Erro no Supabase: {resp.text}")

        url_publica = f"{clean_url}/storage/v1/object/public/{bucket}/{nome_arquivo}"
        return {"url": url_publica}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Falha ao enviar foto: {str(e)}")


# ==============================================================
# ENDPOINTS DO PARTICIPANTE (Área do Usuário Logado)
# ==============================================================

@router.get("/usuario/cineflix")
def obter_cineflix_participante(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    _garantir_tabelas_cineflix()
    
    # 1. Identificar eventos nos quais o usuário possui inscrição ativa
    from app.models.inscricao import Inscricao
    from app.models.diaria import InscricaoDiaria

    eventos_ids = set()
    
    try:
        # Inscrições normais
        inscs = db.query(Inscricao.evento_id).filter(
            Inscricao.usuario_id == current_user.id,
            Inscricao.status != 'CANCELADA'
        ).all()
        for (eid,) in inscs:
            if eid:
                eventos_ids.add(eid)
    except Exception as e:
        print(f"[Cineflix] Erro ao buscar inscricoes normais: {e}")

    try:
        # Diárias
        diarias = db.query(InscricaoDiaria.evento_id).filter(
            InscricaoDiaria.usuario_id == current_user.id,
            InscricaoDiaria.status != 'CANCELADA'
        ).all()
        for (eid,) in diarias:
            if eid:
                eventos_ids.add(eid)
    except Exception as e:
        print(f"[Cineflix] Erro ao buscar inscricoes diarias: {e}")

    # Se não tiver inscrição ainda, pega todos os eventos disponíveis ativos
    if not eventos_ids:
        try:
            evs_ativos = db.query(Evento.id).filter(Evento.ativo == True).all()
            for (eid,) in evs_ativos:
                eventos_ids.add(eid)
        except Exception as e:
            print(f"[Cineflix] Erro ao buscar eventos ativos: {e}")

    eventos_lista = []
    if eventos_ids:
        try:
            eventos_lista = db.query(Evento).filter(Evento.id.in_(list(eventos_ids))).all()
        except Exception as e:
            print(f"[Cineflix] Erro ao buscar lista de eventos: {e}")

    # Se ainda assim não encontrou nenhum evento, lista os primeiros eventos
    if not eventos_lista:
        try:
            eventos_lista = db.query(Evento).limit(5).all()
        except Exception:
            eventos_lista = []

    # 2. Buscar fantasia registrada pelo usuário
    minha_fantasia = None
    try:
        minha_fantasia = db.query(CineflixFantasia).filter(
            CineflixFantasia.usuario_id == current_user.id
        ).first()
    except Exception as e:
        print(f"[Cineflix] Erro ao buscar minha fantasia: {e}")

    # Se já tem fantasia, buscar outros participantes desse evento
    evento_foco_id = minha_fantasia.evento_id if minha_fantasia else (eventos_lista[0].id if eventos_lista else None)

    todas_fantasias = []
    votacao_aberta = True
    cfg_foco = None

    if evento_foco_id:
        try:
            cfg_foco = _obter_ou_criar_config(evento_foco_id, db)
            votacao_aberta = cfg_foco.votacao_aberta
            todas = db.query(CineflixFantasia).filter(
                CineflixFantasia.evento_id == evento_foco_id
            ).order_by(CineflixFantasia.id.asc()).all()
            todas_fantasias = [
                {
                    "id": f.id,
                    "nome_participante": f.nome_participante,
                    "personagem": f.personagem,
                    "universo": f.universo,
                    "descricao": f.descricao,
                    "foto_url": f.foto_url,
                    "eh_minha": bool(f.usuario_id == current_user.id)
                }
                for f in todas
            ]
        except Exception as e:
            print(f"[Cineflix] Erro ao carregar galeria e config: {e}")

    return {
        "usuario_nome": current_user.nome,
        "usuario_id": current_user.id,
        "minha_fantasia": _formatar_fantasia(minha_fantasia, cfg_foco) if minha_fantasia else None,
        "todas_fantasias": todas_fantasias,
        "votacao_aberta": votacao_aberta,
        "eventos_disponiveis": [
            {"id": e.id, "titulo": e.titulo, "nome": e.titulo} for e in eventos_lista
        ]
    }


@router.post("/usuario/cineflix")
def salvar_fantasia_participante(
    dados: FantasiaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    _garantir_tabelas_cineflix()
    evento = db.query(Evento).filter(Evento.id == dados.evento_id).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    # Nome do participante puxa automaticamente do perfil do usuário logado se não informado
    nome_final = (dados.nome_participante or current_user.nome or "").strip()
    if not nome_final:
        nome_final = current_user.nome

    # Verificar se o usuário já tem fantasia neste evento
    existente = db.query(CineflixFantasia).filter(
        CineflixFantasia.evento_id == dados.evento_id,
        CineflixFantasia.usuario_id == current_user.id
    ).first()

    if existente:
        existente.nome_participante = nome_final
        existente.personagem = dados.personagem.strip()
        existente.universo = dados.universo.strip()
        existente.descricao = dados.descricao.strip() if dados.descricao else None
        if dados.foto_url:
            existente.foto_url = dados.foto_url.strip()
        db.commit()
        db.refresh(existente)
        return {"mensagem": "Fantasia atualizada com sucesso!", "fantasia": _formatar_fantasia(existente)}

    nova = CineflixFantasia(
        evento_id=dados.evento_id,
        usuario_id=current_user.id,
        nome_participante=nome_final,
        personagem=dados.personagem.strip(),
        universo=dados.universo.strip(),
        descricao=dados.descricao.strip() if dados.descricao else None,
        foto_url=dados.foto_url.strip() if dados.foto_url else None
    )
    db.add(nova)
    db.commit()
    db.refresh(nova)
    return {"mensagem": "Fantasia cadastrada com sucesso no Cineflix!", "fantasia": _formatar_fantasia(nova)}


@router.delete("/usuario/cineflix/{id}")
def excluir_fantasia_participante(
    id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    _garantir_tabelas_cineflix()
    fantasia = db.query(CineflixFantasia).filter(
        CineflixFantasia.id == id,
        CineflixFantasia.usuario_id == current_user.id
    ).first()
    if not fantasia:
        raise HTTPException(status_code=404, detail="Inscrição no Cineflix não encontrada ou não pertence a você.")

    cfg = db.query(CineflixConfig).filter(CineflixConfig.evento_id == fantasia.evento_id).first()
    if cfg and not cfg.votacao_aberta:
        raise HTTPException(status_code=400, detail="A votação já foi encerrada e a fantasia não pode ser removida.")

    db.delete(fantasia)
    db.commit()
    return {"mensagem": "Inscrição no Cineflix cancelada com sucesso."}


# ==============================================================
# ENDPOINTS PÚBLICOS DE INSCRIÇÃO (Sem necessidade de login)
# ==============================================================

@router.get("/public/cineflix/eventos")
def listar_eventos_publicos_cineflix(
    db: Session = Depends(get_db)
):
    _garantir_tabelas_cineflix()
    # Buscar eventos ativos
    evs = db.query(Evento).filter(Evento.ativo == True).order_by(Evento.data_inicio.asc(), Evento.id.desc()).all()
    if not evs:
        # Fallback para qualquer evento se nenhum ativo
        evs = db.query(Evento).order_by(Evento.id.desc()).limit(10).all()

    return [
        {
            "id": e.id,
            "titulo": e.titulo,
            "descricao": e.descricao,
            "data_inicio": e.data_inicio.isoformat() if e.data_inicio else None
        }
        for e in evs
    ]


@router.post("/public/cineflix/inscrever", status_code=status.HTTP_201_CREATED)
def inscrever_fantasia_publico(
    dados: PublicInscricaoFantasia,
    db: Session = Depends(get_db)
):
    _garantir_tabelas_cineflix()

    evento = db.query(Evento).filter(Evento.id == dados.evento_id).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    cfg = _obter_ou_criar_config(dados.evento_id, db)
    if not cfg.votacao_aberta:
        raise HTTPException(status_code=400, detail="As inscrições e votações do Cineflix estão encerradas para este evento.")

    nome = (dados.nome_participante or "").strip()
    if len(nome) < 2:
        raise HTTPException(status_code=400, detail="Por favor, digite seu nome completo.")

    personagem = (dados.personagem or "").strip()
    if len(personagem) < 2:
        raise HTTPException(status_code=400, detail="Por favor, informe o nome do seu personagem.")

    universo = (dados.universo or "").strip()
    if len(universo) < 2:
        raise HTTPException(status_code=400, detail="Por favor, informe o universo do seu personagem (ex: Marvel, DC, Cinema, Disney, Anime...).")

    descricao = dados.descricao.strip() if dados.descricao else None

    # Obter a maior ordem de apresentação atual para colocar este no final da fila
    from sqlalchemy import func
    max_ordem = db.query(func.max(CineflixFantasia.ordem_apresentacao)).filter(
        CineflixFantasia.evento_id == dados.evento_id
    ).scalar() or 0

    nova = CineflixFantasia(
        evento_id=dados.evento_id,
        usuario_id=None,
        nome_participante=nome,
        personagem=personagem,
        universo=universo,
        descricao=descricao,
        foto_url=None,
        ordem_apresentacao=max_ordem + 1
    )
    db.add(nova)
    db.commit()
    db.refresh(nova)

    return {
        "mensagem": f"Fantasia '{nova.personagem}' inscrita com sucesso no Cineflix!",
        "fantasia": {
            "id": nova.id,
            "evento_id": nova.evento_id,
            "evento_titulo": evento.titulo,
            "nome_participante": nova.nome_participante,
            "personagem": nova.personagem,
            "universo": nova.universo,
            "descricao": nova.descricao,
            "ordem_apresentacao": nova.ordem_apresentacao
        }
    }


# ==============================================================
# ENDPOINTS PÚBLICOS DOS JURADOS (Acesso por Token)
# ==============================================================

@router.get("/public/cineflix/jurado")
def painel_jurado_publico(
    token: str = Query(...),
    db: Session = Depends(get_db)
):
    _garantir_tabelas_cineflix()
    token_clean = token.strip()
    if not token_clean:
        raise HTTPException(status_code=400, detail="Token de jurado é obrigatório.")

    # Localizar a configuração que contém este token
    cfg = db.query(CineflixConfig).filter(
        or_(
            CineflixConfig.token_jurado_1 == token_clean,
            CineflixConfig.token_jurado_2 == token_clean,
            CineflixConfig.token_jurado_3 == token_clean
        )
    ).first()

    if not cfg:
        raise HTTPException(status_code=403, detail="Link de jurado inválido ou expirado.")

    numero_jurado = 1
    nome_jurado = cfg.nome_jurado_1
    if cfg.token_jurado_2 == token_clean:
        numero_jurado = 2
        nome_jurado = cfg.nome_jurado_2
    elif cfg.token_jurado_3 == token_clean:
        numero_jurado = 3
        nome_jurado = cfg.nome_jurado_3

    evento = db.query(Evento).filter(Evento.id == cfg.evento_id).first()
    evento_nome = evento.titulo if evento else "Evento"

    # Verificar se há fantasia no palco ativa para votação
    fantasia_ativa_res = None
    ja_votou_na_ativa = False
    personagem_avaliado = None

    if cfg.fantasia_ativa_id and cfg.votacao_aberta:
        f_ativa = db.query(CineflixFantasia).filter(
            CineflixFantasia.id == cfg.fantasia_ativa_id,
            CineflixFantasia.evento_id == cfg.evento_id
        ).first()

        if f_ativa:
            # Verificar se este jurado já votou nela
            voto_existente = db.query(CineflixVoto).filter(
                CineflixVoto.fantasia_id == f_ativa.id,
                CineflixVoto.numero_jurado == numero_jurado
            ).first()

            if voto_existente:
                # O jurado já votou em todas as categorias: a fantasia SOME para ele
                ja_votou_na_ativa = True
                personagem_avaliado = f_ativa.personagem
                fantasia_ativa_res = None
            else:
                # O jurado ainda não votou: exibe apenas esta fantasia
                ja_votou_na_ativa = False
                fantasia_ativa_res = {
                    "id": f_ativa.id,
                    "nome_participante": f_ativa.nome_participante,
                    "personagem": f_ativa.personagem,
                    "universo": f_ativa.universo,
                    "descricao": f_ativa.descricao,
                    "foto_url": f_ativa.foto_url,
                    "ordem": f_ativa.ordem_apresentacao
                }

    total_fantasias = db.query(CineflixFantasia).filter(CineflixFantasia.evento_id == cfg.evento_id).count()
    total_avaliadas = db.query(CineflixVoto).filter(
        CineflixVoto.evento_id == cfg.evento_id,
        CineflixVoto.numero_jurado == numero_jurado
    ).count()

    return {
        "evento_id": cfg.evento_id,
        "evento_nome": evento_nome,
        "votacao_aberta": cfg.votacao_aberta,
        "numero_jurado": numero_jurado,
        "nome_jurado": nome_jurado,
        "palco_ativo": bool(cfg.fantasia_ativa_id is not None),
        "ja_votou_na_ativa": ja_votou_na_ativa,
        "personagem_avaliado": personagem_avaliado,
        "fantasia_ativa": fantasia_ativa_res,
        "total_fantasias": total_fantasias,
        "total_avaliadas_por_mim": total_avaliadas
    }


@router.post("/public/cineflix/jurado/votar")
def jurado_votar_publico(
    dados: VotoJuradoSubmit,
    db: Session = Depends(get_db)
):
    _garantir_tabelas_cineflix()
    token_clean = dados.token.strip()
    cfg = db.query(CineflixConfig).filter(
        or_(
            CineflixConfig.token_jurado_1 == token_clean,
            CineflixConfig.token_jurado_2 == token_clean,
            CineflixConfig.token_jurado_3 == token_clean
        )
    ).first()

    if not cfg:
        raise HTTPException(status_code=403, detail="Link de jurado inválido.")

    if not cfg.votacao_aberta:
        raise HTTPException(status_code=400, detail="A votação está temporariamente encerrada pela organização.")

    # Validar notas de 1 a 5 apenas (inteiros, sem meios pontos)
    for cat, nota in [
        ("Impacto Visual", dados.nota_impacto_visual),
        ("Performance", dados.nota_performance),
        ("Dedicação", dados.nota_dedicacao)
    ]:
        if nota not in [1, 2, 3, 4, 5]:
            raise HTTPException(status_code=400, detail=f"A nota de {cat} deve ser um número inteiro de 1 a 5.")

    numero_jurado = 1
    if cfg.token_jurado_2 == token_clean:
        numero_jurado = 2
    elif cfg.token_jurado_3 == token_clean:
        numero_jurado = 3

    fantasia = db.query(CineflixFantasia).filter(
        CineflixFantasia.id == dados.fantasia_id,
        CineflixFantasia.evento_id == cfg.evento_id
    ).first()
    if not fantasia:
        raise HTTPException(status_code=404, detail="Fantasia não encontrada neste evento.")

    voto = db.query(CineflixVoto).filter(
        CineflixVoto.fantasia_id == fantasia.id,
        CineflixVoto.numero_jurado == numero_jurado
    ).first()

    if not voto:
        voto = CineflixVoto(
            evento_id=cfg.evento_id,
            fantasia_id=fantasia.id,
            numero_jurado=numero_jurado,
            nota_impacto_visual=float(dados.nota_impacto_visual),
            nota_performance=float(dados.nota_performance),
            nota_dedicacao=float(dados.nota_dedicacao),
            observacao=dados.observacao.strip() if dados.observacao else None
        )
        db.add(voto)
    else:
        voto.nota_impacto_visual = float(dados.nota_impacto_visual)
        voto.nota_performance = float(dados.nota_performance)
        voto.nota_dedicacao = float(dados.nota_dedicacao)
        voto.observacao = dados.observacao.strip() if dados.observacao else None

    db.commit()
    db.refresh(voto)

    total_somado = int(voto.nota_impacto_visual + voto.nota_performance + voto.nota_dedicacao)

    return {
        "mensagem": f"Voto registrado com sucesso para {fantasia.personagem}!",
        "fantasia_id": fantasia.id,
        "personagem": fantasia.personagem,
        "numero_jurado": numero_jurado,
        "total": total_somado
    }
