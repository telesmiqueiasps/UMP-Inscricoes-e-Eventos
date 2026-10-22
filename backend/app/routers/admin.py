from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks, File, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import or_, func, cast, String
from typing import List, Optional
from decimal import Decimal
from pydantic import BaseModel
import httpx
import uuid
import os

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_admin, get_current_user
from app.models.evento import Evento
from app.models.inscricao import Inscricao
from app.models.usuario import Usuario
from app.models.pagamento import Pagamento
from app.models.parcela import Parcela
from app.models.diaria import InscricaoDiaria, DiariaTriagem
from app.schemas.evento import EventoCreate, EventoUpdate, EventoResponse
from app.schemas.inscricao import InscricaoResponse
from app.schemas.pagamento import PagamentoResponse, ParcelaResponse
from app.schemas.diaria import InscricaoDiariaResponse, DiariaConfigUpdate, DiariaUpdateStatus
from app.services.email import enviar_email_confirmacao
from app.services.parcelamento import get_hoje_brasil

router = APIRouter(tags=["Administração e Eventos"])


# --- Rota Pública para Listar Eventos Ativos ---
@router.get("/eventos/publico", response_model=List[EventoResponse])
def listar_eventos_publico(db: Session = Depends(get_db)):
    eventos = db.query(Evento).filter(Evento.ativo == True).order_by(Evento.data_inicio.asc()).all()
    for ev in eventos:
        total_inscritos = db.query(Inscricao).filter(
            Inscricao.evento_id == ev.id,
            Inscricao.status != "CANCELADA"
        ).count()
        ev.vagas_restantes = (ev.max_participantes - total_inscritos) if ev.max_participantes else None
    return eventos


@router.get("/eventos/publico/{id}", response_model=EventoResponse)
def obter_evento_publico(id: int, db: Session = Depends(get_db)):
    evento = db.query(Evento).filter(Evento.id == id, Evento.ativo == True).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado ou inativo.")
    total_inscritos = db.query(Inscricao).filter(
        Inscricao.evento_id == evento.id,
        Inscricao.status != "CANCELADA"
    ).count()
    evento.vagas_restantes = (evento.max_participantes - total_inscritos) if evento.max_participantes else None
    return evento


# --- Painel Administrativo ---

@router.get("/admin/metrics")
def obter_metricas_admin(
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    total_eventos = db.query(Evento).count()
    total_eventos_ativos = db.query(Evento).filter(Evento.ativo == True).count()
    total_eventos_inativos = db.query(Evento).filter(Evento.ativo == False).count()
    
    total_inscritos = db.query(Inscricao).filter(Inscricao.status != "CANCELADA").count()
    media_participantes = (total_inscritos / total_eventos) if total_eventos > 0 else 0.0

    return {
        "total_eventos": total_eventos,
        "total_eventos_ativos": total_eventos_ativos,
        "total_eventos_inativos": total_eventos_inativos,
        "media_participantes": float(round(media_participantes, 2))
    }


# --- Eventos (CRUD Admin) ---

@router.get("/admin/eventos", response_model=List[EventoResponse])
def listar_eventos_admin(
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    eventos = db.query(Evento).order_by(Evento.created_at.desc()).all()
    for ev in eventos:
        total_inscritos = db.query(Inscricao).filter(
            Inscricao.evento_id == ev.id,
            Inscricao.status != "CANCELADA"
        ).count()
        ev.vagas_restantes = (ev.max_participantes - total_inscritos) if ev.max_participantes else None
    return eventos


@router.post("/admin/eventos", response_model=EventoResponse, status_code=status.HTTP_201_CREATED)
def criar_evento_admin(
    evento_in: EventoCreate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    from datetime import datetime, timedelta
    event_data = evento_in.model_dump()
    if event_data.get("data_inicio") is None:
        event_data["data_inicio"] = datetime.utcnow()
    if event_data.get("data_fim") is None:
        event_data["data_fim"] = datetime.utcnow() + timedelta(days=1)
    if event_data.get("valor") is None:
        event_data["valor"] = Decimal("0.00")
        
    db_evento = Evento(**event_data)
    db.add(db_evento)
    db.commit()
    db.refresh(db_evento)
    db_evento.vagas_restantes = db_evento.max_participantes
    return db_evento


@router.get("/admin/eventos/{id}", response_model=EventoResponse)
def obter_evento_admin(
    id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    evento = db.query(Evento).filter(Evento.id == id).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")
    total_inscritos = db.query(Inscricao).filter(
        Inscricao.evento_id == evento.id,
        Inscricao.status != "CANCELADA"
    ).count()
    evento.vagas_restantes = (evento.max_participantes - total_inscritos) if evento.max_participantes else None
    return evento


@router.put("/admin/eventos/{id}", response_model=EventoResponse)
def atualizar_evento_admin(
    id: int,
    evento_in: EventoUpdate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    evento = db.query(Evento).filter(Evento.id == id).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")
    
    update_data = evento_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(evento, field, value)
        
    db.commit()
    db.refresh(evento)
    
    total_inscritos = db.query(Inscricao).filter(
        Inscricao.evento_id == evento.id,
        Inscricao.status != "CANCELADA"
    ).count()
    evento.vagas_restantes = (evento.max_participantes - total_inscritos) if evento.max_participantes else None
    return evento


def deletar_fotos_supabase_task(fotos_str: Optional[str]):
    if not fotos_str or not settings.SUPABASE_URL or not settings.SUPABASE_KEY or not settings.SUPABASE_BUCKET:
        return
    clean_url = settings.SUPABASE_URL.rstrip('/')
    bucket_prefix = f"{clean_url}/storage/v1/object/public/{settings.SUPABASE_BUCKET}/"
    
    fotos_urls = [f.strip() for f in fotos_str.split(',') if f.strip()]
    headers = {"Authorization": f"Bearer {settings.SUPABASE_KEY}"}
    
    import httpx
    with httpx.Client() as client:
        for url in fotos_urls:
            if url.startswith(bucket_prefix):
                filename = url.replace(bucket_prefix, '')
                delete_url = f"{clean_url}/storage/v1/object/{settings.SUPABASE_BUCKET}/{filename}"
                try:
                    res = client.delete(delete_url, headers=headers)
                    if res.status_code != 200:
                        print(f"Erro ao deletar imagem {filename} do Supabase: {res.text}")
                except Exception as e:
                    print(f"Erro de conexão ao deletar imagem {filename}: {e}")


@router.delete("/admin/eventos/{id}", status_code=status.HTTP_204_NO_CONTENT)
def deletar_evento_admin(
    id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    evento = db.query(Evento).filter(Evento.id == id).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")
    
    # Agendar exclusão das fotos do storage
    if evento.fotos:
        background_tasks.add_task(deletar_fotos_supabase_task, evento.fotos)

    db.delete(evento)
    db.commit()
    return None


@router.put("/admin/eventos/{id}/toggle-status", response_model=EventoResponse)
def toggle_status_evento_admin(
    id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    evento = db.query(Evento).filter(Evento.id == id).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")
    evento.ativo = not evento.ativo
    db.commit()
    db.refresh(evento)
    return evento


# --- Gerenciamento de Inscrições ---

@router.get("/admin/inscricoes", response_model=List[InscricaoResponse])
def listar_inscricoes_admin(
    evento_id: Optional[int] = Query(None),
    status_filtro: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    igreja: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=1000),
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    query = db.query(Inscricao).join(Usuario).join(Evento)

    if evento_id:
        query = query.filter(Inscricao.evento_id == evento_id)
    if status_filtro:
        query = query.filter(Inscricao.status == status_filtro)
    if igreja and igreja.strip():
        igreja_clean = igreja.strip()
        query = query.filter(
            or_(
                cast(Inscricao.dados_extras["igreja"], String).ilike(f"%{igreja_clean}%"),
                cast(Inscricao.dados_extras["dyn_igreja"], String).ilike(f"%{igreja_clean}%"),
                cast(Inscricao.dados_extras["Igreja"], String).ilike(f"%{igreja_clean}%")
            )
        )
    if search and search.strip():
        search_pattern = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Usuario.nome.ilike(search_pattern),
                Usuario.email.ilike(search_pattern),
                Usuario.cpf.ilike(search_pattern),
                cast(Inscricao.dados_extras["igreja"], String).ilike(search_pattern),
                cast(Inscricao.dados_extras["dyn_igreja"], String).ilike(search_pattern),
                cast(Inscricao.dados_extras["Igreja"], String).ilike(search_pattern)
            )
        )

    offset = (page - 1) * limit
    inscricoes = query.order_by(Inscricao.created_at.desc()).offset(offset).limit(limit).all()
    return inscricoes


@router.get("/admin/eventos/{evento_id}/igrejas", response_model=List[str])
def listar_igrejas_evento(
    evento_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    inscricoes = db.query(Inscricao.dados_extras).filter(
        Inscricao.evento_id == evento_id,
        Inscricao.dados_extras.isnot(None)
    ).all()

    igrejas_dict = {}
    for (extras,) in inscricoes:
        if isinstance(extras, str):
            try:
                import json
                extras = json.loads(extras)
            except Exception:
                extras = None
        if isinstance(extras, dict):
            igreja = extras.get("igreja") or extras.get("dyn_igreja") or extras.get("Igreja")
            if not igreja:
                for k, v in extras.items():
                    if k.lower() in ("igreja", "dyn_igreja"):
                        igreja = v
                        break
            if igreja and str(igreja).strip():
                nome = str(igreja).strip()
                if nome.lower() not in ("none", "null", ""):
                    key = nome.lower()
                    if key not in igrejas_dict:
                        igrejas_dict[key] = nome

    return sorted(list(igrejas_dict.values()), key=lambda s: s.lower())


@router.put("/admin/inscricoes/{id}/status", response_model=InscricaoResponse)
def atualizar_status_inscricao_admin(
    id: int,
    background_tasks: BackgroundTasks,
    novo_status: str = Query(..., description="PENDENTE, CONFIRMADA, CANCELADA"),
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    inscricao = db.query(Inscricao).filter(Inscricao.id == id).first()
    if not inscricao:
        raise HTTPException(status_code=404, detail="Inscrição não encontrada.")
    
    status_anterior = inscricao.status
    inscricao.status = novo_status.upper()
    
    if inscricao.status == "CANCELADA":
        for pag in inscricao.pagamentos:
            pag.status = "CANCELADO"
            for parc in pag.parcelas:
                parc.status = "CANCELADO"

    db.commit()
    db.refresh(inscricao)

    # Se a inscrição foi confirmada e antes não era confirmada, enviar e-mail
    if inscricao.status == "CONFIRMADA" and status_anterior != "CONFIRMADA":
        background_tasks.add_task(
            enviar_email_confirmacao,
            destinatario_email=inscricao.usuario.email,
            destinatario_nome=inscricao.usuario.nome,
            nome_evento=inscricao.evento.titulo
        )

    return inscricao


# --- Gerenciamento de Pagamentos e Parcelas ---

@router.get("/admin/pagamentos", response_model=List[PagamentoResponse])
def listar_pagamentos_admin(
    evento_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    query = db.query(Pagamento)
    if evento_id is not None:
        query = query.join(Pagamento.inscricao).filter(Inscricao.evento_id == evento_id)
    pagamentos = query.order_by(Pagamento.created_at.desc()).all()
    from app.services.parcelamento import get_hoje_brasil
    hoje = get_hoje_brasil()
    
    for pag in pagamentos:
        if pag.inscricao:
            pag.inscricao_status = pag.inscricao.status
            if pag.inscricao.status == "CANCELADA":
                pag.status = "CANCELADO"
                for parc in pag.parcelas:
                    parc.status = "CANCELADO"
            if pag.inscricao.usuario:
                pag.usuario_nome = pag.inscricao.usuario.nome
                pag.usuario_cpf = pag.inscricao.usuario.cpf
                pag.usuario_email = pag.inscricao.usuario.email
        
        # Calcular status VENCIDO dinamicamente
        any_vencida = False
        for parc in pag.parcelas:
            if parc.status == "PENDENTE" and parc.vencimento < hoje:
                parc.status = "VENCIDO"
                any_vencida = True
        
        if pag.status == "PENDENTE":
            if any_vencida or (pag.forma_pagamento in ["PIX", "INFINITEPAY"] and len(pag.parcelas) > 0 and pag.parcelas[0].vencimento < hoje):
                pag.status = "VENCIDO"
                
    return pagamentos


@router.put("/admin/pagamentos/{id}/status", response_model=PagamentoResponse)
def atualizar_status_pagamento_admin(
    id: int,
    novo_status: str = Query(..., description="PENDENTE, PAGO, CANCELADO"),
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    pagamento = db.query(Pagamento).filter(Pagamento.id == id).first()
    if not pagamento:
        raise HTTPException(status_code=404, detail="Pagamento não encontrado.")
    
    pagamento.status = novo_status.upper()
    if pagamento.status == "CANCELADO":
        for parc in pagamento.parcelas:
            parc.status = "CANCELADO"
    elif pagamento.status == "PAGO":
        for parc in pagamento.parcelas:
            parc.status = "PAGO"
        if pagamento.inscricao:
            pagamento.inscricao.status = "CONFIRMADA"

    db.commit()
    db.refresh(pagamento)
    return pagamento


@router.put("/admin/parcelas/{id}/status", response_model=ParcelaResponse)
def atualizar_status_parcela_admin(
    id: int,
    background_tasks: BackgroundTasks,
    novo_status: str = Query(..., description="PENDENTE, PAGO, CANCELADO"),
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    parcela = db.query(Parcela).filter(Parcela.id == id).first()
    if not parcela:
        raise HTTPException(status_code=404, detail="Parcela não encontrada.")
    
    parcela.status = novo_status.upper()
    db.commit()
    db.refresh(parcela)

    # Verificar status do pagamento pai
    pagamento = db.query(Pagamento).filter(Pagamento.id == parcela.pagamento_id).first()
    if pagamento:
        from decimal import Decimal
        total_pago = sum((p.valor for p in pagamento.parcelas if p.status == "PAGO"), Decimal("0.00"))
        pagamento.paid_amount = total_pago

        todas_pagas = all(p.status == "PAGO" for p in pagamento.parcelas)
        todas_canceladas = all(p.status == "CANCELADO" for p in pagamento.parcelas)
        
        if todas_pagas:
            status_anterior = pagamento.inscricao.status
            pagamento.status = "PAGO"
            # Confirmar inscrição automaticamente
            pagamento.inscricao.status = "CONFIRMADA"
            db.commit()

            # Se antes não estava confirmada, enviar e-mail
            if status_anterior != "CONFIRMADA":
                background_tasks.add_task(
                    enviar_email_confirmacao,
                    destinatario_email=pagamento.inscricao.usuario.email,
                    destinatario_nome=pagamento.inscricao.usuario.nome,
                    nome_evento=pagamento.inscricao.evento.titulo
                )
        elif todas_canceladas:
            pagamento.status = "CANCELADO"
            db.commit()
        else:
            db.commit()

    return parcela


# --- Configurações do Sistema (Admin) ---
from app.models.configuracao import Configuracao

class AtualizarConfiguracoesRequest(BaseModel):
    infinitepay_handle: Optional[str] = None
    pix_chave: Optional[str] = None
    pix_nome_recebedor: Optional[str] = None
    pix_cidade_recebedor: Optional[str] = None

@router.get("/admin/configuracoes")
def obter_configuracoes_admin(
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    from app.services.config import (
        get_infinitepay_handle,
        get_pix_chave,
        get_pix_nome_recebedor,
        get_pix_cidade_recebedor
    )
    return {
        "infinitepay_handle": get_infinitepay_handle(),
        "pix_chave": get_pix_chave(),
        "pix_nome_recebedor": get_pix_nome_recebedor(),
        "pix_cidade_recebedor": get_pix_cidade_recebedor()
    }

@router.put("/admin/configuracoes")
def atualizar_configuracoes_admin(
    req: AtualizarConfiguracoesRequest,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    updates = {
        "infinitepay_handle": req.infinitepay_handle,
        "pix_chave": req.pix_chave,
        "pix_nome_recebedor": req.pix_nome_recebedor,
        "pix_cidade_recebedor": req.pix_cidade_recebedor
    }
    for chave, valor in updates.items():
        if valor is not None:
            config = db.query(Configuracao).filter(Configuracao.chave == chave).first()
            if not config:
                config = Configuracao(chave=chave, valor=valor)
                db.add(config)
            else:
                config.valor = valor
    db.commit()
    return {"message": "Configurações salvas com sucesso!"}


@router.post("/admin/eventos/upload")
async def upload_foto_evento(
    file: UploadFile = File(...),
    admin: Usuario = Depends(get_current_admin)
):
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        raise HTTPException(
            status_code=400,
            detail="Configuração do Supabase Storage ausente no arquivo .env (SUPABASE_URL e SUPABASE_KEY)."
        )

    ext = os.path.splitext(file.filename)[1].lower()
    allowed_exts = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".webm", ".avi", ".mov"]
    if ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail="Formato de arquivo inválido. Apenas imagens e vídeos (.mp4, .webm, .avi, .mov) são permitidos."
        )

    file_content = await file.read()
    if len(file_content) > 25 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="Arquivo muito grande. O limite máximo permitido para upload é de 25MB."
        )

    filename = f"{uuid.uuid4()}{ext}"
    clean_url = settings.SUPABASE_URL.rstrip('/')
    upload_url = f"{clean_url}/storage/v1/object/{settings.SUPABASE_BUCKET}/{filename}"
    
    headers = {
        "Authorization": f"Bearer {settings.SUPABASE_KEY}",
        "Content-Type": file.content_type
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(upload_url, headers=headers, content=file_content)
        
    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Erro ao enviar arquivo para o Supabase Storage: {response.text}"
        )
        
    public_url = f"{clean_url}/storage/v1/object/public/{settings.SUPABASE_BUCKET}/{filename}"
    return {"url": public_url}


class CheckinRequest(BaseModel):
    codigo_checkin: str


# --- Gerenciamento de Diárias do Evento ---

@router.get("/admin/eventos/{evento_id}/diarias", response_model=List[InscricaoDiariaResponse])
def listar_diarias_evento_admin(
    evento_id: int,
    status_filtro: Optional[str] = Query(None, alias="status"),
    dia_filtro: Optional[str] = Query(None, alias="dia"),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    query = db.query(InscricaoDiaria).join(Usuario).filter(InscricaoDiaria.evento_id == evento_id)

    if status_filtro:
        query = query.filter(InscricaoDiaria.status == status_filtro)

    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            or_(
                Usuario.nome.ilike(search_pattern),
                Usuario.cpf.ilike(search_pattern),
                Usuario.email.ilike(search_pattern)
            )
        )

    diarias = query.order_by(InscricaoDiaria.created_at.desc()).all()

    if dia_filtro:
        dia_filtro_limpo = dia_filtro.strip().lower()
        diarias = [
            d for d in diarias
            if any(dia_filtro_limpo in str(x).lower() for x in (d.dias_selecionados or []))
        ]

    return diarias


@router.put("/admin/eventos/{evento_id}/diarias/{diaria_id}/status", response_model=InscricaoDiariaResponse)
def atualizar_status_diaria_admin(
    evento_id: int,
    diaria_id: int,
    req: DiariaUpdateStatus,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    diaria = db.query(InscricaoDiaria).filter(
        InscricaoDiaria.id == diaria_id,
        InscricaoDiaria.evento_id == evento_id
    ).first()
    if not diaria:
        raise HTTPException(status_code=404, detail="Diária não encontrada.")

    diaria.status = req.status
    db.commit()
    db.refresh(diaria)
    return diaria


@router.delete("/admin/eventos/{evento_id}/diarias/{diaria_id}")
def excluir_diaria_admin(
    evento_id: int,
    diaria_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    diaria = db.query(InscricaoDiaria).filter(
        InscricaoDiaria.id == diaria_id,
        InscricaoDiaria.evento_id == evento_id
    ).first()
    if not diaria:
        raise HTTPException(status_code=404, detail="Diária não encontrada.")

    db.delete(diaria)
    db.commit()
    return {"message": "Diária excluída com sucesso."}


@router.put("/admin/eventos/{evento_id}/diarias-config")
def atualizar_config_diarias_admin(
    evento_id: int,
    req: DiariaConfigUpdate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    evento = db.query(Evento).filter(Evento.id == evento_id).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    evento.diarias_habilitadas = req.diarias_habilitadas
    evento.config_diarias = req.config_diarias
    evento.campos_formulario_diaria = req.campos_formulario_diaria

    db.commit()
    db.refresh(evento)

    return {
        "sucesso": True,
        "mensagem": "Configurações de diárias atualizadas com sucesso!",
        "diarias_habilitadas": evento.diarias_habilitadas,
        "config_diarias": evento.config_diarias,
        "campos_formulario_diaria": evento.campos_formulario_diaria
    }


# --- Endpoints de Check-in Unificado (Aba Controle do Evento) ---
@router.get("/admin/eventos/{evento_id}/checkin/detalhes")
def obter_detalhes_checkin(
    evento_id: int,
    codigo_checkin: str,
    admin: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    codigo_clean = codigo_checkin.strip()

    # 1. Tentar buscar em Inscricao Regular
    inscricao = db.query(Inscricao).filter(
        Inscricao.evento_id == evento_id,
        Inscricao.codigo_checkin == codigo_clean
    ).first()

    if inscricao:
        usuario = inscricao.usuario
        return {
            "id": inscricao.id,
            "tipo": "REGULAR",
            "tipo_label": "Inscrição Integral",
            "nome": usuario.nome if usuario else "",
            "cpf": usuario.cpf if usuario else "",
            "email": usuario.email if usuario else "",
            "status": inscricao.status,
            "checkin_realizado": inscricao.checkin_realizado,
            "checkin_data": inscricao.checkin_data.isoformat() if inscricao.checkin_data else None,
            "codigo_checkin": inscricao.codigo_checkin,
            "valido_hoje": True,
            "dias_selecionados": []
        }

    # 2. Tentar buscar em Inscricao Diaria
    diaria = db.query(InscricaoDiaria).filter(
        InscricaoDiaria.evento_id == evento_id,
        InscricaoDiaria.codigo_checkin == codigo_clean
    ).first()

    if diaria:
        usuario = diaria.usuario
        hoje = get_hoje_brasil()
        hoje_iso = hoje.strftime("%Y-%m-%d")
        dias = diaria.dias_selecionados or []

        valido_hoje = False
        for d in dias:
            d_str = str(d).strip()
            if d_str == hoje_iso or hoje_iso in d_str or hoje.strftime("%d/%m") in d_str:
                valido_hoje = True
                break

        return {
            "id": diaria.id,
            "tipo": "DIARIA",
            "tipo_label": "Diária",
            "nome": usuario.nome if usuario else "",
            "cpf": usuario.cpf if usuario else "",
            "email": usuario.email if usuario else "",
            "status": diaria.status,
            "checkin_realizado": diaria.checkin_realizado,
            "checkin_data": diaria.checkin_data.isoformat() if diaria.checkin_data else None,
            "codigo_checkin": diaria.codigo_checkin,
            "valido_hoje": valido_hoje,
            "dias_selecionados": dias,
            "dias_formatados": ", ".join(dias) if isinstance(dias, list) else str(dias)
        }

    raise HTTPException(
        status_code=404,
        detail="Código de check-in não encontrado para este evento (nem como integral nem como diária)."
    )


@router.post("/admin/eventos/{evento_id}/checkin")
def realizar_checkin(
    evento_id: int,
    req: CheckinRequest,
    admin: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    codigo_clean = req.codigo_checkin.strip()
    from datetime import datetime

    # 1. Tentar Inscrição Regular
    inscricao = db.query(Inscricao).filter(
        Inscricao.evento_id == evento_id,
        Inscricao.codigo_checkin == codigo_clean
    ).first()

    if inscricao:
        usuario = inscricao.usuario
        if inscricao.status != "CONFIRMADA":
            return {
                "sucesso": False,
                "tipo": "REGULAR",
                "status_inscricao": inscricao.status,
                "participante": {"nome": usuario.nome, "cpf": usuario.cpf, "email": usuario.email},
                "mensagem": f"Aviso: Inscrição está no status '{inscricao.status}'. Pagamento não confirmado."
            }

        if inscricao.checkin_realizado:
            checkin_dt_str = inscricao.checkin_data.strftime("%d/%m/%Y %H:%M:%S") if inscricao.checkin_data else "Desconhecido"
            return {
                "sucesso": False,
                "tipo": "REGULAR",
                "status_inscricao": inscricao.status,
                "participante": {"nome": usuario.nome, "cpf": usuario.cpf, "email": usuario.email},
                "mensagem": f"Check-in integral já realizado anteriormente em {checkin_dt_str}."
            }

        inscricao.checkin_realizado = True
        inscricao.checkin_data = datetime.utcnow()
        db.commit()

        return {
            "sucesso": True,
            "tipo": "REGULAR",
            "status_inscricao": inscricao.status,
            "participante": {"nome": usuario.nome, "cpf": usuario.cpf, "email": usuario.email},
            "mensagem": "Check-in realizado com sucesso! (Inscrição Integral)"
        }

    # 2. Tentar Inscrição Diária
    diaria = db.query(InscricaoDiaria).filter(
        InscricaoDiaria.evento_id == evento_id,
        InscricaoDiaria.codigo_checkin == codigo_clean
    ).first()

    if diaria:
        usuario = diaria.usuario
        if diaria.status != "CONFIRMADA":
            return {
                "sucesso": False,
                "tipo": "DIARIA",
                "status_inscricao": diaria.status,
                "participante": {"nome": usuario.nome, "cpf": usuario.cpf, "email": usuario.email},
                "mensagem": f"Aviso: Diária está no status '{diaria.status}'. Pagamento não confirmado."
            }

        if diaria.checkin_realizado:
            checkin_dt_str = diaria.checkin_data.strftime("%d/%m/%Y %H:%M:%S") if diaria.checkin_data else "Desconhecido"
            return {
                "sucesso": False,
                "tipo": "DIARIA",
                "status_inscricao": diaria.status,
                "participante": {"nome": usuario.nome, "cpf": usuario.cpf, "email": usuario.email},
                "mensagem": f"Check-in de diária já realizado anteriormente em {checkin_dt_str}."
            }

        diaria.checkin_realizado = True
        diaria.checkin_data = datetime.utcnow()
        db.commit()

        dias_str = ", ".join(diaria.dias_selecionados) if isinstance(diaria.dias_selecionados, list) else str(diaria.dias_selecionados)
        return {
            "sucesso": True,
            "tipo": "DIARIA",
            "dias_selecionados": diaria.dias_selecionados,
            "status_inscricao": diaria.status,
            "participante": {"nome": usuario.nome, "cpf": usuario.cpf, "email": usuario.email},
            "mensagem": f"Check-in de diária realizado com sucesso! (Dias: {dias_str})"
        }

    raise HTTPException(
        status_code=404,
        detail="Código de check-in não encontrado."
    )


@router.get("/admin/eventos/{evento_id}/checkin/participantes")
def listar_participantes_checkin(
    evento_id: int,
    search: Optional[str] = Query(None),
    tipo_filtro: Optional[str] = Query(None, alias="tipo"),
    admin: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    search_pattern = f"%{search}%" if search else None

    # Inscrições Regulares
    query_ins = db.query(Inscricao).join(Usuario).filter(Inscricao.evento_id == evento_id)
    if search_pattern:
        query_ins = query_ins.filter(
            or_(
                Usuario.nome.ilike(search_pattern),
                Usuario.cpf.ilike(search_pattern),
                Usuario.email.ilike(search_pattern)
            )
        )
    inscricoes = query_ins.all()

    # Inscrições Diárias
    query_dia = db.query(InscricaoDiaria).join(Usuario).filter(InscricaoDiaria.evento_id == evento_id)
    if search_pattern:
        query_dia = query_dia.filter(
            or_(
                Usuario.nome.ilike(search_pattern),
                Usuario.cpf.ilike(search_pattern),
                Usuario.email.ilike(search_pattern)
            )
        )
    diarias = query_dia.all()

    resultado = []
    if not tipo_filtro or tipo_filtro.upper() in ["TODOS", "REGULAR"]:
        for ins in inscricoes:
            resultado.append({
                "inscricao_id": ins.id,
                "tipo": "REGULAR",
                "tipo_label": "Integral",
                "nome": ins.usuario.nome if ins.usuario else "",
                "cpf": ins.usuario.cpf if ins.usuario else "",
                "email": ins.usuario.email if ins.usuario else "",
                "status": ins.status,
                "codigo_checkin": ins.codigo_checkin,
                "checkin_realizado": ins.checkin_realizado,
                "checkin_data": ins.checkin_data.isoformat() if ins.checkin_data else None,
                "dias_selecionados": []
            })

    if not tipo_filtro or tipo_filtro.upper() in ["TODOS", "DIARIA"]:
        for d in diarias:
            dias = d.dias_selecionados or []
            resultado.append({
                "inscricao_id": d.id,
                "tipo": "DIARIA",
                "tipo_label": "Diária",
                "nome": d.usuario.nome if d.usuario else "",
                "cpf": d.usuario.cpf if d.usuario else "",
                "email": d.usuario.email if d.usuario else "",
                "status": d.status,
                "codigo_checkin": d.codigo_checkin,
                "checkin_realizado": d.checkin_realizado,
                "checkin_data": d.checkin_data.isoformat() if d.checkin_data else None,
                "dias_selecionados": dias,
                "dias_formatados": ", ".join(dias) if isinstance(dias, list) else str(dias)
            })

    resultado.sort(key=lambda x: (x.get("nome") or "").lower())
    return resultado


@router.post("/admin/eventos/{evento_id}/inscricoes/{inscricao_id}/toggle-checkin")
def toggle_checkin_manual(
    evento_id: int,
    inscricao_id: int,
    tipo: str = Query("REGULAR"),
    admin: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    from datetime import datetime
    if tipo.upper() == "DIARIA":
        diaria = db.query(InscricaoDiaria).filter(
            InscricaoDiaria.id == inscricao_id,
            InscricaoDiaria.evento_id == evento_id
        ).first()

        if not diaria:
            raise HTTPException(status_code=404, detail="Diária não encontrada.")

        if diaria.checkin_realizado:
            diaria.checkin_realizado = False
            diaria.checkin_data = None
            mensagem = "Check-in de diária desfeito com sucesso."
        else:
            diaria.checkin_realizado = True
            diaria.checkin_data = datetime.utcnow()
            mensagem = "Check-in de diária realizado com sucesso."

        db.commit()
        return {
            "sucesso": True,
            "checkin_realizado": diaria.checkin_realizado,
            "mensagem": mensagem
        }

    # Inscrição Regular
    inscricao = db.query(Inscricao).filter(
        Inscricao.id == inscricao_id,
        Inscricao.evento_id == evento_id
    ).first()

    if not inscricao:
        raise HTTPException(status_code=404, detail="Inscrição não encontrada.")

    if inscricao.checkin_realizado:
        inscricao.checkin_realizado = False
        inscricao.checkin_data = None
        mensagem = "Check-in desfeito com sucesso."
    else:
        inscricao.checkin_realizado = True
        inscricao.checkin_data = datetime.utcnow()
        mensagem = "Check-in realizado com sucesso."

    db.commit()
    return {
        "sucesso": True,
        "checkin_realizado": inscricao.checkin_realizado,
        "mensagem": mensagem
    }


@router.post("/admin/reconciliar-pagamentos")
async def disparar_reconciliacao_admin(
    admin: Usuario = Depends(get_current_admin)
):
    """
    Executa a reconciliação de pagamentos e parcelas pendentes com a InfinitePay sob demanda.
    """
    from app.services.reconciliation import reconciliar_pagamentos_pendentes
    try:
        await reconciliar_pagamentos_pendentes()
        return {"sucesso": True, "mensagem": "Reconciliação executada com sucesso!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao executar reconciliação: {str(e)}")

