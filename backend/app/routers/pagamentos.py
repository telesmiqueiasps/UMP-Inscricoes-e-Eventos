from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from decimal import Decimal

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.usuario import Usuario
from app.models.inscricao import Inscricao
from app.models.inscricao_triagem import InscricaoTriagem
from app.models.pagamento import Pagamento
from app.models.parcela import Parcela
from app.schemas.pagamento import PagamentoResponse, ParcelaResponse
from app.services.parcelamento import gerar_parcelas, calcular_max_parcelas
from app.services.pix import gerar_copia_cola_pix, gerar_qr_code_base64
from app.services.infinitepay import infinitepay_service
from app.services.pdf_generator import gerar_pdf_parcela
from datetime import datetime, date
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pagamentos", tags=["Pagamentos"])


class ProcessarPagamentoRequest(BaseModel):
    inscricao_id: int
    forma_pagamento: str  # PIX, INFINITEPAY, PARCELADO
    num_parcelas: Optional[int] = 1
    data_primeira_parcela: Optional[str] = None  # Formato YYYY-MM-DD


class ProcessarTriagemRequest(BaseModel):
    triagem_id: int


@router.post("/processar-triagem")
def processar_pagamento_triagem(
    req: ProcessarTriagemRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    triagem = db.query(InscricaoTriagem).filter(InscricaoTriagem.id == req.triagem_id).first()
    if not triagem:
        raise HTTPException(status_code=404, detail="Triagem de inscrição não encontrada.")

    if triagem.usuario_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acesso negado a esta triagem.")

    forma_pag = (triagem.forma_pagamento or "PIX").upper()
    evento = triagem.evento

    receipt_url = None
    copia_cola_pix = None
    qr_code_pix = None
    parcelas_info = []

    if forma_pag == "PIX":
        if evento.link_pagamento_pix:
            copia_cola_pix = evento.link_pagamento_pix
            qr_code_pix = gerar_qr_code_base64(copia_cola_pix)
            receipt_url = copia_cola_pix
        else:
            order_nsu = f"TRIAGEM-{triagem.id}"
            result = infinitepay_service.criar_checkout_link(
                order_nsu=order_nsu,
                valor=triagem.valor_total,
                descricao=f"Inscrição Evento #{evento.id} - {evento.titulo} (Pix)",
                customer_email=current_user.email,
                customer_name=current_user.nome
            )
            receipt_url = result.get("checkout_url")
            copia_cola_pix = receipt_url
            qr_code_pix = ""

    elif forma_pag == "INFINITEPAY":
        order_nsu = f"TRIAGEM-{triagem.id}"
        if evento.link_pagamento_cartao:
            receipt_url = evento.link_pagamento_cartao
        else:
            result = infinitepay_service.criar_checkout_link(
                order_nsu=order_nsu,
                valor=triagem.valor_total,
                descricao=f"Inscrição Evento #{evento.id} - {evento.titulo}",
                customer_email=current_user.email,
                customer_name=current_user.nome
            )
            receipt_url = result.get("checkout_url")

    elif forma_pag == "PARCELADO":
        dt_primeira = triagem.data_primeira_parcela or date.today()
        if dt_primeira < date.today():
            dt_primeira = date.today()

        dt_limite = evento.data_inicio.date() if evento.data_inicio else dt_primeira

        max_permitido = calcular_max_parcelas(dt_primeira, dt_limite)
        n_parcelas = min(max(triagem.num_parcelas or 1, 1), max(max_permitido, 1))

        parcelas_calc = gerar_parcelas(
            valor_total=triagem.valor_total,
            num_parcelas=n_parcelas,
            data_primeira_parcela=dt_primeira,
            data_limite_evento=dt_limite
        )

        for item in parcelas_calc:
            order_nsu_parc = f"TRIAGEM-{triagem.id}-PARC-{item['numero']}"
            try:
                res = infinitepay_service.criar_checkout_link(
                    order_nsu=order_nsu_parc,
                    valor=item["valor"],
                    descricao=f"Inscrição Evento #{evento.id} - Parcela {item['numero']}/{n_parcelas}",
                    customer_email=current_user.email,
                    customer_name=current_user.nome
                )
                link_parc = res.get("checkout_url")
            except Exception:
                link_parc = gerar_copia_cola_pix(
                    valor=item["valor"],
                    txid=f"TR{triagem.id}P{item['numero']}"
                )

            parcelas_info.append({
                "numero": item["numero"],
                "vencimento": item["vencimento"].isoformat(),
                "valor": float(item["valor"]),
                "status": "PENDENTE",
                "copia_cola_pix": link_parc
            })

    return {
        "triagem_id": triagem.id,
        "forma_pagamento": forma_pag,
        "valor_total": float(triagem.valor_total),
        "receipt_url": receipt_url,
        "copia_cola_pix": copia_cola_pix,
        "qr_code_pix": qr_code_pix,
        "parcelas": parcelas_info
    }


@router.post("/processar", response_model=PagamentoResponse)
def processar_pagamento(
    req: ProcessarPagamentoRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    inscricao = db.query(Inscricao).filter(Inscricao.id == req.inscricao_id).first()
    if not inscricao:
        raise HTTPException(status_code=404, detail="Inscrição não encontrada.")

    if inscricao.usuario_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acesso negado a esta inscrição.")

    if inscricao.status == "CANCELADA":
        raise HTTPException(status_code=400, detail="Esta inscrição está cancelada. Não é possível processar pagamentos.")

    forma_pag = req.forma_pagamento.upper()
    if forma_pag not in ["PIX", "INFINITEPAY", "PARCELADO"]:
        raise HTTPException(status_code=400, detail="Forma de pagamento inválida.")

    # Atualizar forma de pagamento na inscrição
    inscricao.forma_pagamento = forma_pag

    # Remover pagamentos anteriores em aberto se houver
    db.query(Pagamento).filter(
        Pagamento.inscricao_id == inscricao.id,
        Pagamento.status == "PENDENTE"
    ).delete()
    db.commit()

    db_pagamento = Pagamento(
        inscricao_id=inscricao.id,
        forma_pagamento=forma_pag,
        valor=inscricao.valor_total,
        status="PENDENTE"
    )
    db.add(db_pagamento)
    db.commit()
    db.refresh(db_pagamento)

    if forma_pag == "PIX":
        # Se o evento tiver um link de pagamento Pix pré-configurado pelo admin, usa ele diretamente
        if inscricao.evento.link_pagamento_pix:
            copia_cola = inscricao.evento.link_pagamento_pix
            qr_code_b64 = gerar_qr_code_base64(copia_cola)
            db_pagamento.receipt_url = copia_cola
            db_pagamento.copia_cola_pix = copia_cola
            db_pagamento.qr_code_pix = qr_code_b64
        else:
            # Gerar link do checkout da InfinitePay para o Pix
            order_nsu = f"ORD-{inscricao.id}-{db_pagamento.id}"
            result = infinitepay_service.criar_checkout_link(
                order_nsu=order_nsu,
                valor=inscricao.valor_total,
                descricao=f"Inscrição Evento #{inscricao.evento_id} - {inscricao.evento.titulo} (Pix)",
                customer_email=current_user.email,
                customer_name=current_user.nome
            )
            db_pagamento.order_nsu = order_nsu
            db_pagamento.receipt_url = result.get("checkout_url")
            db_pagamento.invoice_slug = result.get("invoice_slug")
            
            copia_cola = result.get("checkout_url")
            qr_code_b64 = "" # Sem QR code local já que usará o checkout da InfinitePay
            
            db_pagamento.copia_cola_pix = copia_cola
            db_pagamento.qr_code_pix = qr_code_b64

        # Criar 1 parcela única para o Pix
        parc = Parcela(
            pagamento_id=db_pagamento.id,
            numero=1,
            vencimento=inscricao.created_at.date(),
            valor=inscricao.valor_total,
            copia_cola_pix=copia_cola,
            qr_code_pix=qr_code_b64,
            status="PENDENTE"
        )
        db.add(parc)

    elif forma_pag == "INFINITEPAY":
        order_nsu = f"ORD-{inscricao.id}-{db_pagamento.id}"
        
        # Se o evento tiver um link de pagamento de cartão pré-configurado pelo admin, usa ele diretamente
        if inscricao.evento.link_pagamento_cartao:
            db_pagamento.order_nsu = order_nsu
            db_pagamento.receipt_url = inscricao.evento.link_pagamento_cartao
        else:
            # Chamar InfinitePay para gerar o link do checkout do cartão
            result = infinitepay_service.criar_checkout_link(
                order_nsu=order_nsu,
                valor=inscricao.valor_total,
                descricao=f"Inscrição Evento #{inscricao.evento_id} - {inscricao.evento.titulo}",
                customer_email=current_user.email,
                customer_name=current_user.nome
            )

            db_pagamento.order_nsu = order_nsu
            db_pagamento.receipt_url = result.get("checkout_url")
            db_pagamento.invoice_slug = result.get("invoice_slug")

    elif forma_pag == "PARCELADO":
        from datetime import datetime, date
        from app.services.parcelamento import calcular_max_parcelas
        
        # 1. Resolver data da primeira parcela
        if req.data_primeira_parcela:
            try:
                data_primeira_parcela = datetime.strptime(req.data_primeira_parcela, "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(status_code=400, detail="Formato de data inválido. Use AAAA-MM-DD.")
        else:
            data_primeira_parcela = date.today() + timedelta(days=30)

        # A data da primeira parcela não pode ser anterior a hoje
        if data_primeira_parcela < date.today():
            data_primeira_parcela = date.today()

        data_limite = inscricao.evento.data_inicio.date()

        # 2. Calcular máximo de parcelas permitidas
        max_permitido = calcular_max_parcelas(data_primeira_parcela, data_limite)
        if max_permitido < 1:
            raise HTTPException(
                status_code=400,
                detail="A data de vencimento selecionada é posterior ao início do evento. Parcelamento indisponível."
            )
            
        n_parcelas = min(max(req.num_parcelas or 1, 1), max_permitido)

        parcelas_calculadas = gerar_parcelas(
            valor_total=inscricao.valor_total,
            num_parcelas=n_parcelas,
            data_primeira_parcela=data_primeira_parcela,
            data_limite_evento=data_limite
        )

        for item in parcelas_calculadas:
            order_nsu_parc = f"ORD-{inscricao.id}-PARC-{item['numero']}"
            
            # Tentar gerar checkout link dinâmico na InfinitePay para cada parcela
            try:
                res = infinitepay_service.criar_checkout_link(
                    order_nsu=order_nsu_parc,
                    valor=item["valor"],
                    descricao=f"Inscrição Evento #{inscricao.evento_id} - Parcela {item['numero']}/{n_parcelas}",
                    customer_email=current_user.email,
                    customer_name=current_user.nome
                )
                copia_cola_parc = res.get("checkout_url")
            except Exception:
                # Fallback para Pix estático local caso a API falhe
                copia_cola_parc = gerar_copia_cola_pix(
                    valor=item["valor"],
                    txid=f"INS{inscricao.id}P{item['numero']}"
                )

            qr_b64_parc = gerar_qr_code_base64(copia_cola_parc) if not copia_cola_parc.startswith("http") else ""

            parc = Parcela(
                pagamento_id=db_pagamento.id,
                numero=item["numero"],
                vencimento=item["vencimento"],
                valor=item["valor"],
                copia_cola_pix=copia_cola_parc,
                qr_code_pix=qr_b64_parc,
                status="PENDENTE"
            )
            db.add(parc)

    db.commit()
    db.refresh(db_pagamento)
    return db_pagamento


@router.get("/inscricao/{inscricao_id}", response_model=PagamentoResponse)
def obter_pagamento_inscricao(
    inscricao_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    pagamento = db.query(Pagamento).filter(Pagamento.inscricao_id == inscricao_id).order_by(Pagamento.created_at.desc()).first()
    if not pagamento:
        raise HTTPException(status_code=404, detail="Nenhum pagamento registrado para esta inscrição.")

    if pagamento.inscricao.usuario_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acesso negado a este pagamento.")

    if pagamento.inscricao.status == "CANCELADA":
        pagamento.status = "CANCELADO"
        for parc in pagamento.parcelas:
            parc.status = "CANCELADO"

    return pagamento


def obter_usuario_por_token_ou_query(
    request: Request,
    db: Session = Depends(get_db)
) -> Usuario:
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    else:
        token = request.query_params.get("token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Não autenticado."
        )

    try:
        from jose import jwt
        from app.core.config import settings
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Token inválido.")
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido.")

    user = db.query(Usuario).filter(Usuario.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado.")
    return user


@router.get("/parcelas/{parcela_id}/pdf")
def baixar_pdf_parcela(
    parcela_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(obter_usuario_por_token_ou_query)
):
    parcela = db.query(Parcela).filter(Parcela.id == parcela_id).first()
    if not parcela:
        raise HTTPException(status_code=404, detail="Parcela não encontrada.")

    pagamento = parcela.pagamento
    inscricao = pagamento.inscricao

    if inscricao.usuario_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acesso negado a esta parcela.")

    total_parcelas = len(pagamento.parcelas)

    pdf_bytes = gerar_pdf_parcela(
        parcela_id=parcela.id,
        numero_parcela=parcela.numero,
        total_parcelas=total_parcelas,
        vencimento=parcela.vencimento,
        valor=parcela.valor,
        status=parcela.status,
        nome_participante=inscricao.usuario.nome,
        cpf_participante=inscricao.usuario.cpf,
        nome_evento=inscricao.evento.titulo,
        copia_cola_pix=parcela.copia_cola_pix
    )

    filename = f"parcela_{parcela.numero}_inscricao_{inscricao.id}.pdf"
    headers = {
        "Content-Disposition": f"inline; filename={filename}"
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)
