from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from decimal import Decimal

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.usuario import Usuario
from app.models.inscricao import Inscricao
from app.models.pagamento import Pagamento
from app.models.parcela import Parcela
from app.schemas.pagamento import PagamentoResponse, ParcelaResponse
from app.services.parcelamento import gerar_parcelas
from app.services.pix import gerar_copia_cola_pix, gerar_qr_code_base64
from app.services.infinitepay import infinitepay_service
from app.services.pdf_generator import gerar_pdf_parcela
from app.services.mercadopago import mercadopago_service
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pagamentos", tags=["Pagamentos"])


class ProcessarPagamentoRequest(BaseModel):
    inscricao_id: int
    forma_pagamento: str  # PIX, INFINITEPAY, PARCELADO
    num_parcelas: Optional[int] = 1


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
        else:
            # Tentar criar pagamento Pix dinâmico no Mercado Pago
            mp_pagamento = mercadopago_service.criar_pagamento_pix(
                valor=float(inscricao.valor_total),
                descricao=f"Inscrição Evento #{inscricao.evento_id} - {inscricao.evento.titulo}",
                email_pagador=current_user.email,
                nome_pagador=current_user.nome,
                cpf_pagador=current_user.cpf
            )

            if mp_pagamento:
                copia_cola = mp_pagamento["copia_cola"]
                qr_code_b64 = mp_pagamento["qr_code_base64"]
                db_pagamento.transaction_nsu = mp_pagamento["id_transacao"] # Salvar ID do Mercado Pago
            else:
                # Fallback seguro: Gerar Pix estático local
                logger.warning("Falha na geração do Pix Mercado Pago. Usando Pix local estático como fallback.")
                copia_cola = gerar_copia_cola_pix(
                    valor=inscricao.valor_total,
                    txid=f"INS{inscricao.id}"
                )
                qr_code_b64 = gerar_qr_code_base64(copia_cola)

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
        # Validar número de parcelas permitido pelo evento
        max_parc = inscricao.evento.max_parcelas or 1
        n_parcelas = min(max(req.num_parcelas or 1, 1), max_parc)

        parcelas_calculadas = gerar_parcelas(
            valor_total=inscricao.valor_total,
            num_parcelas=n_parcelas
        )

        for item in parcelas_calculadas:
            copia_cola_parc = gerar_copia_cola_pix(
                valor=item["valor"],
                txid=f"INS{inscricao.id}P{item['numero']}"
            )
            qr_b64_parc = gerar_qr_code_base64(copia_cola_parc)

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
