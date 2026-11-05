import os
import uuid
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text
from typing import Optional

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user, require_permissao
from app.models.usuario import Usuario
from app.models.evento import Evento
from app.models.inscricao import Inscricao
from app.models.diaria import InscricaoDiaria
from app.models.oficina import Oficina, OficinaInscricao, OficinaConfig
from app.schemas.oficina import (
    OficinaCreate,
    OficinaUpdate,
    OficinaDisponibilidadeInput,
    OficinaConfigUpdate,
    OficinaInscreverAdminInput
)

router = APIRouter(tags=["Oficinas"])

_TABELAS_OFICINAS_VERIFICADAS = False


def _garantir_tabelas_oficinas():
    global _TABELAS_OFICINAS_VERIFICADAS
    if _TABELAS_OFICINAS_VERIFICADAS:
        return
    try:
        from app.core.database import engine, Base
        Base.metadata.create_all(
            bind=engine,
            tables=[OficinaConfig.__table__, Oficina.__table__, OficinaInscricao.__table__]
        )
        with engine.connect() as conn:
            try:
                conn.execute(text("ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS foto_ministrante TEXT;"))
                conn.commit()
            except Exception:
                pass
        _TABELAS_OFICINAS_VERIFICADAS = True
    except Exception:
        pass


def _obter_config_oficina(db: Session) -> OficinaConfig:
    cfg = db.query(OficinaConfig).first()
    if not cfg:
        cfg = OficinaConfig(aba_participante_visivel=True)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def _usuario_esta_inscrito_no_evento(db: Session, usuario_id: int, evento_id: int) -> dict | None:
    """
    Verifica se o usuário possui inscrição ativa no evento (Inscrição Regular não cancelada
    ou Diária confirmada). Retorna dicionário com informações do vínculo ou None.
    """
    ins_reg = (
        db.query(Inscricao)
        .filter(
            Inscricao.usuario_id == usuario_id,
            Inscricao.evento_id == evento_id,
            Inscricao.status != "CANCELADA"
        )
        .order_by(Inscricao.id.desc())
        .first()
    )
    if ins_reg:
        return {
            "tipo": "REGULAR",
            "inscricao_id": ins_reg.id,
            "status": ins_reg.status
        }

    ins_dia = (
        db.query(InscricaoDiaria)
        .filter(
            InscricaoDiaria.usuario_id == usuario_id,
            InscricaoDiaria.evento_id == evento_id,
            InscricaoDiaria.status == "CONFIRMADA"
        )
        .order_by(InscricaoDiaria.id.desc())
        .first()
    )
    if ins_dia:
        return {
            "tipo": "DIARIA",
            "inscricao_id": ins_dia.id,
            "status": ins_dia.status
        }

    return None


def _serializar_oficina_admin(oficina: Oficina) -> dict:
    inscricoes = oficina.inscricoes or []
    capacidade = max(1, int(oficina.capacidade or 1))
    ocupadas = len(inscricoes)
    disponiveis = max(0, capacidade - ocupadas)
    pct = min(100.0, round((ocupadas / capacidade) * 100, 1))

    inscritos_lista = []
    for ins in sorted(inscricoes, key=lambda x: (x.usuario.nome.lower() if x.usuario and x.usuario.nome else "")):
        u = ins.usuario
        inscritos_lista.append({
            "id": ins.id,
            "usuario_id": ins.usuario_id,
            "nome": u.nome if u else f"Participante #{ins.usuario_id}",
            "email": u.email if u else "",
            "cpf": u.cpf if u else "",
            "telefone": u.telefone if u else "",
            "created_at": ins.created_at.isoformat() if ins.created_at else None
        })

    return {
        "id": oficina.id,
        "evento_id": oficina.evento_id,
        "evento_titulo": oficina.evento.titulo if oficina.evento else f"Evento #{oficina.evento_id}",
        "titulo": oficina.titulo,
        "nome": oficina.titulo,
        "descricao": oficina.descricao,
        "ministrante": oficina.ministrante,
        "foto_ministrante": oficina.foto_ministrante,
        "local": oficina.local,
        "horario": oficina.horario,
        "capacidade": capacidade,
        "vagas_ocupadas": ocupadas,
        "vagas_disponiveis": disponiveis,
        "percentual_ocupacao": pct,
        "esgotada": disponiveis <= 0,
        "ativa": bool(oficina.ativa),
        "created_at": oficina.created_at.isoformat() if oficina.created_at else None,
        "inscritos": inscritos_lista
    }


def _serializar_oficina_participante(oficina: Oficina, usuario_id: int) -> dict:
    inscricoes = oficina.inscricoes or []
    capacidade = max(1, int(oficina.capacidade or 1))
    ocupadas = len(inscricoes)
    disponiveis = max(0, capacidade - ocupadas)
    pct = min(100.0, round((ocupadas / capacidade) * 100, 1))
    inscrito_nesta = any(i.usuario_id == usuario_id for i in inscricoes)

    return {
        "id": oficina.id,
        "evento_id": oficina.evento_id,
        "evento_titulo": oficina.evento.titulo if oficina.evento else f"Evento #{oficina.evento_id}",
        "titulo": oficina.titulo,
        "nome": oficina.titulo,
        "descricao": oficina.descricao,
        "ministrante": oficina.ministrante,
        "foto_ministrante": oficina.foto_ministrante,
        "local": oficina.local,
        "horario": oficina.horario,
        "capacidade": capacidade,
        "vagas_ocupadas": ocupadas,
        "vagas_disponiveis": disponiveis,
        "percentual_ocupacao": pct,
        "esgotada": disponiveis <= 0,
        "ativa": bool(oficina.ativa),
        "inscrito_nesta": inscrito_nesta
    }


# ==============================================================
# ROTAS DO PAINEL ADMINISTRATIVO (/admin/oficinas)
# ==============================================================

@router.get("/admin/oficinas")
def listar_oficinas_admin(
    evento_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("oficinas"))
):
    _garantir_tabelas_oficinas()
    cfg = _obter_config_oficina(db)

    eventos = db.query(Evento).order_by(Evento.id.desc()).all()
    query = (
        db.query(Oficina)
        .options(
            joinedload(Oficina.evento),
            joinedload(Oficina.inscricoes).joinedload(OficinaInscricao.usuario)
        )
    )
    if evento_id is not None:
        query = query.filter(Oficina.evento_id == evento_id)

    oficinas = query.order_by(Oficina.evento_id.desc(), Oficina.titulo.asc()).all()
    serializadas = [_serializar_oficina_admin(of) for of in oficinas]

    total_vagas = sum(o["capacidade"] for o in serializadas)
    total_inscritos = sum(o["vagas_ocupadas"] for o in serializadas)
    total_disponiveis = sum(o["vagas_disponiveis"] for o in serializadas)

    return {
        "config": {
            "aba_participante_visivel": bool(cfg.aba_participante_visivel)
        },
        "resumo": {
            "total_oficinas": len(serializadas),
            "total_vagas": total_vagas,
            "total_inscritos": total_inscritos,
            "total_vagas_disponiveis": total_disponiveis
        },
        "eventos": [
            {
                "id": ev.id,
                "titulo": ev.titulo,
                "ativo": ev.ativo
            }
            for ev in eventos
        ],
        "oficinas": serializadas
    }


@router.put("/admin/oficinas/config")
def atualizar_config_oficinas(
    req: OficinaConfigUpdate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("oficinas"))
):
    _garantir_tabelas_oficinas()
    cfg = _obter_config_oficina(db)
    cfg.aba_participante_visivel = bool(req.aba_participante_visivel)
    db.commit()
    db.refresh(cfg)

    status_txt = "disponível" if cfg.aba_participante_visivel else "oculta"
    return {
        "sucesso": True,
        "aba_participante_visivel": bool(cfg.aba_participante_visivel),
        "mensagem": f"Aba de oficinas agora está {status_txt} no painel do participante."
    }


@router.post("/admin/oficinas", status_code=status.HTTP_201_CREATED)
def criar_oficina_admin(
    req: OficinaCreate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("oficinas"))
):
    _garantir_tabelas_oficinas()

    evento = db.query(Evento).filter(Evento.id == req.evento_id).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento selecionado não encontrado.")

    nova = Oficina(
        evento_id=req.evento_id,
        titulo=req.titulo.strip(),
        descricao=req.descricao.strip() if req.descricao else None,
        ministrante=req.ministrante.strip() if req.ministrante else None,
        foto_ministrante=req.foto_ministrante.strip() if req.foto_ministrante else None,
        local=req.local.strip() if req.local else None,
        horario=req.horario.strip() if req.horario else None,
        capacidade=max(1, int(req.capacidade)),
        ativa=req.ativa
    )
    db.add(nova)
    db.commit()
    db.refresh(nova)

    oficina_db = (
        db.query(Oficina)
        .options(
            joinedload(Oficina.evento),
            joinedload(Oficina.inscricoes).joinedload(OficinaInscricao.usuario)
        )
        .filter(Oficina.id == nova.id)
        .first()
    )
    return {
        "sucesso": True,
        "mensagem": f"Oficina '{nova.titulo}' criada com sucesso!",
        "oficina": _serializar_oficina_admin(oficina_db)
    }


@router.patch("/admin/oficinas/{oficina_id}/disponibilidade")
def alternar_disponibilidade_oficina_admin(
    oficina_id: int,
    req: OficinaDisponibilidadeInput,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("oficinas"))
):
    _garantir_tabelas_oficinas()

    oficina = (
        db.query(Oficina)
        .options(
            joinedload(Oficina.evento),
            joinedload(Oficina.inscricoes).joinedload(OficinaInscricao.usuario)
        )
        .filter(Oficina.id == oficina_id)
        .first()
    )
    if not oficina:
        raise HTTPException(status_code=404, detail="Oficina não encontrada.")

    oficina.ativa = bool(req.ativa)
    db.commit()
    db.refresh(oficina)

    estado_str = "disponível na aba do participante" if oficina.ativa else "oculta na aba do participante"
    return {
        "sucesso": True,
        "mensagem": f"Oficina '{oficina.titulo}' marcada como {estado_str}.",
        "oficina": _serializar_oficina_admin(oficina)
    }


@router.put("/admin/oficinas/{oficina_id}")
def atualizar_oficina_admin(
    oficina_id: int,
    req: OficinaUpdate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("oficinas"))
):
    _garantir_tabelas_oficinas()

    oficina = (
        db.query(Oficina)
        .options(
            joinedload(Oficina.evento),
            joinedload(Oficina.inscricoes).joinedload(OficinaInscricao.usuario)
        )
        .filter(Oficina.id == oficina_id)
        .first()
    )
    if not oficina:
        raise HTTPException(status_code=404, detail="Oficina não encontrada.")

    ocupadas = len(oficina.inscricoes or [])
    if req.capacidade is not None and req.capacidade < ocupadas:
        raise HTTPException(
            status_code=400,
            detail=f"Não é possível reduzir as vagas para {req.capacidade}, pois já existem {ocupadas} participantes inscritos nesta oficina."
        )

    if req.evento_id is not None and req.evento_id != oficina.evento_id:
        ev = db.query(Evento).filter(Evento.id == req.evento_id).first()
        if not ev:
            raise HTTPException(status_code=404, detail="Evento selecionado não encontrado.")
        oficina.evento_id = req.evento_id

    if req.titulo is not None:
        oficina.titulo = req.titulo.strip()
    if req.descricao is not None:
        oficina.descricao = req.descricao.strip() if req.descricao else None
    if req.ministrante is not None:
        oficina.ministrante = req.ministrante.strip() if req.ministrante else None
    if req.foto_ministrante is not None:
        oficina.foto_ministrante = req.foto_ministrante.strip() if req.foto_ministrante else None
    if req.local is not None:
        oficina.local = req.local.strip() if req.local else None
    if req.horario is not None:
        oficina.horario = req.horario.strip() if req.horario else None
    if req.capacidade is not None:
        oficina.capacidade = max(1, int(req.capacidade))
    if req.ativa is not None:
        oficina.ativa = bool(req.ativa)

    db.commit()
    db.refresh(oficina)
    return {
        "sucesso": True,
        "mensagem": "Oficina atualizada com sucesso!",
        "oficina": _serializar_oficina_admin(oficina)
    }


@router.post("/admin/oficinas/upload")
async def upload_foto_ministrante_oficina(
    file: UploadFile = File(...),
    admin: Usuario = Depends(require_permissao("oficinas"))
):
    """
    Faz upload de foto para o ministrante da oficina diretamente no bucket Supabase configurado.
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        raise HTTPException(
            status_code=400,
            detail="Configuração do Supabase Storage ausente no arquivo .env (SUPABASE_URL e SUPABASE_KEY)."
        )

    ext = os.path.splitext(file.filename or "")[1].lower()
    allowed_exts = [".jpg", ".jpeg", ".png", ".webp", ".gif"]
    if ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail="Formato de arquivo inválido. Apenas imagens (.jpg, .jpeg, .png, .webp, .gif) são permitidas para a foto do ministrante."
        )

    file_content = await file.read()
    if len(file_content) > 15 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="Arquivo muito grande. O limite máximo permitido para a foto do ministrante é de 15MB."
        )

    filename = f"ministrantes_{uuid.uuid4()}{ext}"
    clean_url = settings.SUPABASE_URL.rstrip('/')
    bucket = settings.SUPABASE_BUCKET or "eventos"
    upload_url = f"{clean_url}/storage/v1/object/{bucket}/{filename}"

    headers = {
        "Authorization": f"Bearer {settings.SUPABASE_KEY}",
        "Content-Type": file.content_type or "image/jpeg"
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(upload_url, headers=headers, content=file_content)

    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Erro ao enviar arquivo para o Supabase Storage: {response.text}"
        )

    public_url = f"{clean_url}/storage/v1/object/public/{bucket}/{filename}"
    return {"url": public_url}


@router.delete("/admin/oficinas/{oficina_id}")
def excluir_oficina_admin(
    oficina_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("oficinas"))
):
    _garantir_tabelas_oficinas()

    oficina = db.query(Oficina).filter(Oficina.id == oficina_id).first()
    if not oficina:
        raise HTTPException(status_code=404, detail="Oficina não encontrada.")

    db.delete(oficina)
    db.commit()
    return {"sucesso": True, "mensagem": "Oficina excluída com sucesso."}


@router.get("/admin/oficinas/evento/{evento_id}/participantes-elegiveis")
def listar_participantes_elegiveis_evento(
    evento_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("oficinas"))
):
    _garantir_tabelas_oficinas()

    inscricoes_reg = (
        db.query(Inscricao)
        .options(joinedload(Inscricao.usuario))
        .filter(Inscricao.evento_id == evento_id, Inscricao.status != "CANCELADA")
        .all()
    )
    inscricoes_dia = (
        db.query(InscricaoDiaria)
        .options(joinedload(InscricaoDiaria.usuario))
        .filter(InscricaoDiaria.evento_id == evento_id, InscricaoDiaria.status == "CONFIRMADA")
        .all()
    )
    inscricoes_oficina_ev = (
        db.query(OficinaInscricao)
        .options(joinedload(OficinaInscricao.oficina))
        .filter(OficinaInscricao.evento_id == evento_id)
        .all()
    )
    mapa_oficina_usuario = {
        io.usuario_id: {
            "oficina_id": io.oficina_id,
            "oficina_titulo": io.oficina.titulo if io.oficina else f"Oficina #{io.oficina_id}"
        }
        for io in inscricoes_oficina_ev
    }

    participantes_map = {}
    for ir in inscricoes_reg:
        if ir.usuario:
            participantes_map[ir.usuario_id] = {
                "usuario_id": ir.usuario_id,
                "nome": ir.usuario.nome,
                "email": ir.usuario.email,
                "cpf": ir.usuario.cpf,
                "tipo_inscricao": "REGULAR",
                "status_inscricao": ir.status,
                "oficina_atual": mapa_oficina_usuario.get(ir.usuario_id)
            }

    for idia in inscricoes_dia:
        if idia.usuario and idia.usuario_id not in participantes_map:
            participantes_map[idia.usuario_id] = {
                "usuario_id": idia.usuario_id,
                "nome": idia.usuario.nome,
                "email": idia.usuario.email,
                "cpf": idia.usuario.cpf,
                "tipo_inscricao": "DIARIA",
                "status_inscricao": idia.status,
                "oficina_atual": mapa_oficina_usuario.get(idia.usuario_id)
            }

    lista = sorted(participantes_map.values(), key=lambda x: (x["nome"] or "").lower())
    return {"participantes": lista}


@router.post("/admin/oficinas/{oficina_id}/inscritos")
def adicionar_inscrito_oficina_admin(
    oficina_id: int,
    req: OficinaInscreverAdminInput,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("oficinas"))
):
    _garantir_tabelas_oficinas()

    oficina = (
        db.query(Oficina)
        .options(joinedload(Oficina.inscricoes))
        .filter(Oficina.id == oficina_id)
        .first()
    )
    if not oficina:
        raise HTTPException(status_code=404, detail="Oficina não encontrada.")

    vinculo = _usuario_esta_inscrito_no_evento(db, req.usuario_id, oficina.evento_id)
    if not vinculo:
        raise HTTPException(
            status_code=400,
            detail="Este usuário não possui inscrição ativa no evento vinculado a esta oficina."
        )

    existente = (
        db.query(OficinaInscricao)
        .filter(
            OficinaInscricao.evento_id == oficina.evento_id,
            OficinaInscricao.usuario_id == req.usuario_id
        )
        .first()
    )
    if existente and existente.oficina_id == oficina.id:
        raise HTTPException(status_code=400, detail="Este participante já está inscrito nesta oficina.")

    ocupadas = len(oficina.inscricoes or [])
    if ocupadas >= oficina.capacidade:
        raise HTTPException(status_code=400, detail="Esta oficina já atingiu o limite máximo de vagas.")

    if existente:
        existente.oficina_id = oficina.id
    else:
        nova_ins = OficinaInscricao(
            oficina_id=oficina.id,
            evento_id=oficina.evento_id,
            usuario_id=req.usuario_id
        )
        db.add(nova_ins)

    db.commit()
    return {"sucesso": True, "mensagem": "Participante vinculado à oficina com sucesso!"}


@router.delete("/admin/oficinas/{oficina_id}/inscritos/{usuario_id}")
def remover_inscrito_oficina_admin(
    oficina_id: int,
    usuario_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("oficinas"))
):
    _garantir_tabelas_oficinas()

    reg = (
        db.query(OficinaInscricao)
        .filter(
            OficinaInscricao.oficina_id == oficina_id,
            OficinaInscricao.usuario_id == usuario_id
        )
        .first()
    )
    if not reg:
        raise HTTPException(status_code=404, detail="Inscrição do participante nesta oficina não encontrada.")

    db.delete(reg)
    db.commit()
    return {"sucesso": True, "mensagem": "Participante removido da oficina e vaga liberada."}


# ==============================================================
# ROTAS DO PAINEL DO PARTICIPANTE (/oficinas/...)
# ==============================================================

@router.get("/oficinas/participante")
def listar_oficinas_para_participante(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Retorna os eventos nos quais o participante logado está inscrito e a lista
    de oficinas vinculadas a cada um desses eventos, com vagas disponíveis em tempo real.
    """
    _garantir_tabelas_oficinas()
    cfg = _obter_config_oficina(db)

    if not cfg.aba_participante_visivel:
        return {
            "aba_participante_visivel": False,
            "possui_inscricao_evento": False,
            "eventos": []
        }

    inscricoes_reg = (
        db.query(Inscricao)
        .options(joinedload(Inscricao.evento))
        .filter(
            Inscricao.usuario_id == current_user.id,
            Inscricao.status != "CANCELADA"
        )
        .order_by(Inscricao.id.desc())
        .all()
    )
    inscricoes_dia = (
        db.query(InscricaoDiaria)
        .options(joinedload(InscricaoDiaria.evento))
        .filter(
            InscricaoDiaria.usuario_id == current_user.id,
            InscricaoDiaria.status == "CONFIRMADA"
        )
        .order_by(InscricaoDiaria.id.desc())
        .all()
    )

    eventos_map = {}
    for ir in inscricoes_reg:
        if ir.evento and ir.evento_id not in eventos_map:
            eventos_map[ir.evento_id] = {
                "evento_id": ir.evento_id,
                "evento_titulo": ir.evento.titulo,
                "evento_local": ir.evento.local,
                "tipo_vinculo": "REGULAR",
                "status_inscricao": ir.status
            }

    for idia in inscricoes_dia:
        if idia.evento and idia.evento_id not in eventos_map:
            eventos_map[idia.evento_id] = {
                "evento_id": idia.evento_id,
                "evento_titulo": idia.evento.titulo,
                "evento_local": idia.evento.local,
                "tipo_vinculo": "DIARIA",
                "status_inscricao": idia.status
            }

    if not eventos_map:
        return {
            "aba_participante_visivel": True,
            "possui_inscricao_evento": False,
            "eventos": []
        }

    eventos_ids = list(eventos_map.keys())
    todas_oficinas = (
        db.query(Oficina)
        .options(
            joinedload(Oficina.evento),
            joinedload(Oficina.inscricoes)
        )
        .filter(Oficina.evento_id.in_(eventos_ids))
        .order_by(Oficina.titulo.asc())
        .all()
    )

    minhas_inscricoes_oficinas = (
        db.query(OficinaInscricao)
        .filter(
            OficinaInscricao.usuario_id == current_user.id,
            OficinaInscricao.evento_id.in_(eventos_ids)
        )
        .all()
    )
    mapa_minha_oficina_por_evento = {
        mi.evento_id: mi.oficina_id for mi in minhas_inscricoes_oficinas
    }

    oficinas_por_evento = {}
    for of in todas_oficinas:
        serial = _serializar_oficina_participante(of, current_user.id)
        if serial["ativa"] or serial["inscrito_nesta"]:
            oficinas_por_evento.setdefault(of.evento_id, []).append(serial)

    resultado_eventos = []
    for ev_id, info_ev in eventos_map.items():
        lista_ofs = oficinas_por_evento.get(ev_id, [])
        minha_of_id = mapa_minha_oficina_por_evento.get(ev_id)
        minha_of_obj = next((o for o in lista_ofs if o["id"] == minha_of_id), None)

        resultado_eventos.append({
            **info_ev,
            "minha_oficina_id": minha_of_id,
            "minha_oficina": minha_of_obj,
            "oficinas": lista_ofs
        })

    return {
        "aba_participante_visivel": True,
        "possui_inscricao_evento": True,
        "eventos": resultado_eventos
    }


@router.post("/oficinas/{oficina_id}/inscrever")
def inscrever_participante_em_oficina(
    oficina_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    _garantir_tabelas_oficinas()
    cfg = _obter_config_oficina(db)
    if not cfg.aba_participante_visivel:
        raise HTTPException(
            status_code=400,
            detail="As inscrições para as oficinas ainda não estão disponíveis no painel do participante."
        )

    oficina = (
        db.query(Oficina)
        .options(joinedload(Oficina.inscricoes), joinedload(Oficina.evento))
        .filter(Oficina.id == oficina_id)
        .first()
    )
    if not oficina:
        raise HTTPException(status_code=404, detail="Oficina não encontrada.")

    if not oficina.ativa:
        raise HTTPException(status_code=400, detail="Esta oficina não está disponível para inscrições no momento.")

    vinculo = _usuario_esta_inscrito_no_evento(db, current_user.id, oficina.evento_id)
    if not vinculo:
        raise HTTPException(
            status_code=403,
            detail="Apenas participantes inscritos neste evento podem ocupar vaga nas oficinas."
        )

    inscricao_atual = (
        db.query(OficinaInscricao)
        .options(joinedload(OficinaInscricao.oficina))
        .filter(
            OficinaInscricao.evento_id == oficina.evento_id,
            OficinaInscricao.usuario_id == current_user.id
        )
        .first()
    )

    if inscricao_atual and inscricao_atual.oficina_id == oficina.id:
        msg_ja = f"Você já está inscrito na oficina '{oficina.titulo}'."
        return {
            "sucesso": True,
            "mensagem": msg_ja,
            "message": msg_ja,
            "oficina_id": oficina.id
        }

    vagas_ocupadas = len([i for i in (oficina.inscricoes or []) if i.usuario_id != current_user.id])
    if vagas_ocupadas >= oficina.capacidade:
        raise HTTPException(
            status_code=400,
            detail=f"As vagas para a oficina '{oficina.titulo}' acabaram de esgotar."
        )

    trocou = False
    titulo_anterior = None
    if inscricao_atual:
        trocou = True
        titulo_anterior = inscricao_atual.oficina.titulo if inscricao_atual.oficina else None
        inscricao_atual.oficina_id = oficina.id
    else:
        nova = OficinaInscricao(
            oficina_id=oficina.id,
            evento_id=oficina.evento_id,
            usuario_id=current_user.id
        )
        db.add(nova)

    db.commit()

    msg = (
        f"Inscrição alterada de '{titulo_anterior}' para '{oficina.titulo}' com sucesso!"
        if trocou and titulo_anterior
        else f"Sua inscrição na oficina '{oficina.titulo}' foi confirmada com sucesso!"
    )

    return {
        "sucesso": True,
        "mensagem": msg,
        "message": msg,
        "oficina_id": oficina.id
    }


@router.delete("/oficinas/{oficina_id}/cancelar-minha-inscricao")
def cancelar_minha_inscricao_oficina(
    oficina_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    _garantir_tabelas_oficinas()

    inscricao_atual = (
        db.query(OficinaInscricao)
        .filter(
            OficinaInscricao.oficina_id == oficina_id,
            OficinaInscricao.usuario_id == current_user.id
        )
        .first()
    )
    if not inscricao_atual:
        raise HTTPException(status_code=404, detail="Você não está inscrito nesta oficina.")

    db.delete(inscricao_atual)
    db.commit()
    msg = "Sua inscrição na oficina foi cancelada e a vaga foi liberada."
    return {
        "sucesso": True,
        "mensagem": msg,
        "message": msg
    }
