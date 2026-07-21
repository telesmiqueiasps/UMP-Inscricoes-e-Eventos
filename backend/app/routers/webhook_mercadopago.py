from fastapi import APIRouter, Depends, HTTPException, status, Request, BackgroundTasks, Query
from sqlalchemy.orm import Session
import logging
from typing import Optional

from app.core.database import get_db
from app.models.pagamento import Pagamento
from app.models.inscricao import Inscricao
from app.services.mercadopago import mercadopago_service
from app.services.email import enviar_email_confirmacao

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhook", tags=["Webhooks"])


@router.post("/mercadopago", status_code=status.HTTP_200_OK)
async def webhook_mercadopago(
    request: Request,
    background_tasks: BackgroundTasks,
    id: Optional[str] = Query(None),
    topic: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Webhook / IPN para receber notificações de pagamentos do Mercado Pago.
    Lida com o formato Webhook (JSON no body) e IPN (query params).
    """
    payment_id = id

    # 1. Tentar ler do body JSON se não veio via query params
    if not payment_id:
        try:
            body = await request.json()
            # Formato Webhook padrão: {"type": "payment", "data": {"id": "..."}}
            if body.get("type") == "payment" or body.get("topic") == "payment":
                data = body.get("data", {})
                payment_id = str(data.get("id") or "")
            elif "id" in body:
                payment_id = str(body["id"])
        except Exception:
            pass

    if not payment_id:
        logger.warning("Webhook Mercado Pago recebido sem ID de pagamento válido.")
        return {"message": "ID do pagamento ausente.", "status": "ignored"}

    logger.info(f"Processando notificação de pagamento Mercado Pago ID: {payment_id}")

    # 2. Consultar detalhes do pagamento diretamente na API do Mercado Pago
    mp_data = mercadopago_service.obter_pagamento(payment_id)
    if not mp_data:
        logger.error(f"Não foi possível consultar os detalhes do pagamento {payment_id} no Mercado Pago.")
        return {"message": "Erro ao consultar transação no Mercado Pago.", "status": "error"}

    status_mp = mp_data.get("status")
    logger.info(f"Pagamento MP {payment_id} possui status: {status_mp}")

    # 3. Processar caso esteja aprovado
    if status_mp == "approved":
        # Buscar pagamento correspondente no banco (Mercado Pago ID salvo em transaction_nsu)
        pagamento = db.query(Pagamento).filter(
            (Pagamento.transaction_nsu == payment_id) | (Pagamento.order_nsu == payment_id)
        ).first()

        if not pagamento:
            logger.warning(f"Pagamento Mercado Pago {payment_id} não foi encontrado no banco de dados local.")
            return {"message": "Pagamento não encontrado no banco local.", "status": "not_found"}

        if pagamento.status != "PAGO":
            status_anterior = pagamento.inscricao.status if pagamento.inscricao else "PENDENTE"
            
            # Dar baixa no pagamento
            pagamento.status = "PAGO"
            
            # Atualizar status das parcelas se houver
            for parc in pagamento.parcelas:
                parc.status = "PAGO"

            # Confirmar inscrição correspondente
            if pagamento.inscricao:
                pagamento.inscricao.status = "CONFIRMADA"
                db.commit()

                # Enviar e-mail de confirmação em background se antes não estava confirmada
                if status_anterior != "CONFIRMADA":
                    background_tasks.add_task(
                        enviar_email_confirmacao,
                        destinatario_email=pagamento.inscricao.usuario.email,
                        destinatario_nome=pagamento.inscricao.usuario.nome,
                        nome_evento=pagamento.inscricao.evento.titulo
                    )
                    logger.info(f"Inscrição #{pagamento.inscricao.id} confirmada e e-mail enviado.")
            else:
                db.commit()

            return {"message": "Pagamento aprovado e inscrição confirmada.", "status": "confirmed"}
        else:
            return {"message": "Pagamento já estava aprovado e processado.", "status": "already_done"}

    elif status_mp in ["rejected", "cancelled", "refunded"]:
        # Se for rejeitado/cancelado, marcar como cancelado no banco
        pagamento = db.query(Pagamento).filter(
            (Pagamento.transaction_nsu == payment_id) | (Pagamento.order_nsu == payment_id)
        ).first()

        if pagamento and pagamento.status != "CANCELADO":
            pagamento.status = "CANCELADO"
            for parc in pagamento.parcelas:
                parc.status = "CANCELADO"
            db.commit()
            logger.info(f"Pagamento MP {payment_id} cancelado/rejeitado no banco local.")
            return {"message": "Status atualizado para cancelado.", "status": "cancelled"}

    return {"message": f"Webhook processado. Status {status_mp} ignorado.", "status": "ignored"}
