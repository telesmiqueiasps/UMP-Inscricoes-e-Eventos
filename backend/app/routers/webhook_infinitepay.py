from fastapi import APIRouter, Depends, HTTPException, status, Request, BackgroundTasks
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.pagamento import Pagamento
from app.models.inscricao import Inscricao
from app.models.usuario import Usuario
from app.schemas.pagamento import WebhookInfinitePaySchema
from app.services.email import enviar_email_confirmacao
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhook", tags=["Webhooks"])


@router.post("/infinitepay", status_code=status.HTTP_200_OK)
async def webhook_infinitepay(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Webhook para receber notificações de pagamentos efetuados via InfinitePay.
    Atualiza o pagamento, salva transaction_nsu, receipt_url, order_nsu e invoice_slug,
    e confirma a inscrição correspondente.
    """
    try:
        data = await request.json()
        logger.warning(f"Webhook InfinitePay Payload Recebido: {data}")
    except Exception as e:
        logger.error(f"Erro ao ler json do webhook: {e}")
        raise HTTPException(status_code=400, detail="Payload JSON inválido")

    # Tenta extrair dados com flexibilidade para suportar diferentes payloads da InfinitePay
    inner_data = data.get("data", {}) if isinstance(data.get("data"), dict) else {}
    inner_metadata = inner_data.get("metadata", {}) if isinstance(inner_data.get("metadata"), dict) else {}
    flat_metadata = data.get("metadata", {}) if isinstance(data.get("metadata"), dict) else {}

    order_nsu = (
        data.get("order_nsu")
        or inner_data.get("order_nsu")
        or flat_metadata.get("order_nsu")
        or inner_metadata.get("order_nsu")
    )
    
    invoice_slug = (
        data.get("invoice_slug")
        or inner_data.get("invoice_slug")
        or data.get("slug")
        or inner_data.get("slug")
    )
    
    transaction_nsu = (
        data.get("transaction_nsu")
        or inner_data.get("transaction_nsu")
        or data.get("id")
        or inner_data.get("id")
    )
    
    receipt_url = (
        data.get("receipt_url")
        or inner_data.get("receipt_url")
    )
    
    # Determinar status
    status_raw = (
        data.get("status")
        or inner_data.get("status")
        or data.get("state")
        or inner_data.get("state")
        or data.get("event")
        or ""
    )
    payment_status = str(status_raw).lower()

    # Se não encontrar por order_nsu, tentar buscar pelo e-mail do cliente (útil para links manuais do app)
    customer_data = data.get("customer", {}) if isinstance(data.get("customer"), dict) else {}
    if not customer_data:
        customer_data = inner_data.get("customer", {}) if isinstance(inner_data.get("customer"), dict) else {}
    
    customer_email = (
        customer_data.get("email")
        or data.get("customer_email")
        or inner_data.get("customer_email")
        or data.get("email")
        or inner_data.get("email")
    )

    logger.warning(
        f"Webhook InfinitePay Parsed: order_nsu={order_nsu}, invoice_slug={invoice_slug}, "
        f"transaction_nsu={transaction_nsu}, payment_status={payment_status}, customer_email={customer_email}"
    )

    # --- LÓGICA DE WEBHOOK PARA PARCELA INDIVIDUAL DO CARNÊ ---
    if order_nsu and "-PARC-" in str(order_nsu):
        try:
            parts = str(order_nsu).split("-")
            inscricao_id = int(parts[1])
            parcela_num = int(parts[3])
            
            from app.models.parcela import Parcela
            from decimal import Decimal

            # Localizar a parcela correspondente
            parcela = db.query(Parcela).join(Pagamento).filter(
                Pagamento.inscricao_id == inscricao_id,
                Parcela.numero == parcela_num
            ).first()

            if not parcela:
                logger.error(f"Parcela #{parcela_num} da Inscrição #{inscricao_id} não encontrada!")
                raise HTTPException(status_code=400, detail="Parcela correspondente não encontrada.")

            # Verificar se já foi processada anteriormente
            if parcela.status == "PAGO":
                logger.warning(f"Parcela ID={parcela.id} (Nº {parcela_num}) já consta como PAGA. Retornando 200 (idempotência).")
                return {"message": "Webhook processado anteriormente para esta parcela."}

            # Marcar parcela como PAGA
            parcela.status = "PAGO"
            db.commit()
            logger.warning(f"Parcela ID={parcela.id} (Nº {parcela_num}) atualizada para PAGO.")

            # Incrementar paid_amount e salvar capture_method no Pagamento pai
            pagamento = parcela.pagamento
            paid_amount_raw = data.get("paid_amount") or inner_data.get("paid_amount") or 0
            capture_method = str(data.get("capture_method") or inner_data.get("capture_method") or "")

            if paid_amount_raw:
                pagamento.paid_amount = (pagamento.paid_amount or Decimal("0.00")) + Decimal(str(paid_amount_raw)) / 100
            if capture_method:
                pagamento.capture_method = capture_method
            db.commit()

            # Se todas as parcelas do carnê estiverem pagas, damos baixa no pagamento completo
            todas_pagas = all(p.status == "PAGO" for p in pagamento.parcelas)
            if todas_pagas:
                status_anterior = pagamento.status
                pagamento.status = "PAGO"
                pagamento.inscricao.status = "CONFIRMADA"
                db.commit()
                logger.warning(f"Todas as parcelas pagas! Pagamento ID={pagamento.id} e Inscrição ID={pagamento.inscricao_id} CONFIRMADA.")

                # Agendar e-mail de confirmação global se o pagamento não estava confirmado
                if status_anterior != "PAGO":
                    background_tasks.add_task(
                        enviar_email_confirmacao,
                        destinatario_email=pagamento.inscricao.usuario.email,
                        destinatario_nome=pagamento.inscricao.usuario.nome,
                        nome_evento=pagamento.inscricao.evento.titulo
                    )
            return {"message": f"Parcela #{parcela_num} paga com sucesso."}
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            logger.error(f"Erro ao processar webhook de parcela: {e}")
            raise HTTPException(status_code=400, detail="Erro interno ao processar parcela.")

    pagamento = None
    if order_nsu or invoice_slug:
        # Buscar pagamento no banco por order_nsu ou invoice_slug
        pagamento = db.query(Pagamento).filter(
            (Pagamento.order_nsu == order_nsu) | (Pagamento.invoice_slug == invoice_slug)
        ).first()
        if pagamento:
            logger.warning(f"Pagamento encontrado por ID/NSU: {pagamento.id}")

    if not pagamento and customer_email:
        logger.warning(f"Tentando localizar pagamento por e-mail do cliente: {customer_email}")
        usuario = db.query(Usuario).filter(Usuario.email.ilike(customer_email)).first()
        if usuario:
            # Buscar inscrição pendente mais recente
            inscricao = db.query(Inscricao).filter(
                Inscricao.usuario_id == usuario.id,
                Inscricao.status == "PENDENTE"
            ).order_by(Inscricao.created_at.desc()).first()
            
            if inscricao:
                pagamento = db.query(Pagamento).filter(
                    Pagamento.inscricao_id == inscricao.id,
                    Pagamento.status == "PENDENTE"
                ).first()
                if pagamento:
                    logger.warning(f"Pagamento encontrado por e-mail: ID={pagamento.id}, Inscricao={inscricao.id}")

    # A heurística de valor só é aplicada para checkouts manuais (sem order_nsu ou com order_nsu gerado pelo app que não segue o padrão ORD-)
    is_manual_checkout = not order_nsu or not str(order_nsu).startswith("ORD-")
    
    if not pagamento and is_manual_checkout:
        # Tentar buscar qualquer pagamento pendente com o mesmo valor criado nos últimos 60 minutos
        from datetime import datetime, timedelta
        from decimal import Decimal
        amount_raw = data.get("amount") or data.get("paid_amount") or inner_data.get("amount") or 0
        amount_reais = Decimal(str(amount_raw)) / 100
        if amount_reais > 0:
            logger.warning(f"Tentando localizar pagamento por heuristica de valor ({amount_reais}) nos ultimos 60 min")
            uma_hora_atras = datetime.utcnow() - timedelta(minutes=60)
            pagamento = db.query(Pagamento).join(Inscricao).filter(
                Pagamento.status == "PENDENTE",
                Pagamento.valor == amount_reais,
                Inscricao.status == "PENDENTE",
                Inscricao.created_at >= uma_hora_atras
            ).order_by(Inscricao.created_at.desc()).first()
            if pagamento:
                logger.warning(f"Pagamento correspondente encontrado por heuristica de valor e tempo: ID={pagamento.id}, Usuario={pagamento.inscricao.usuario.email}")

    if not pagamento:
        logger.warning(f"Pagamento correspondente não encontrado. Ignorando webhook e respondendo 400. Payload bruto: {data}")
        raise HTTPException(status_code=400, detail="Pagamento correspondente não encontrado.")

    # Idempotência: Se o pagamento já constar como PAGO, responde 200 OK imediatamente
    if pagamento.status == "PAGO":
        logger.warning(f"Pagamento ID={pagamento.id} já consta como PAGO no banco. Retornando 200 imediatamente (idempotência).")
        return {"message": "Webhook processado anteriormente.", "status": pagamento.status}

    # Atualizar campos adicionais
    if transaction_nsu:
        pagamento.transaction_nsu = str(transaction_nsu)
    if receipt_url:
        pagamento.receipt_url = str(receipt_url)
    if invoice_slug:
        pagamento.invoice_slug = str(invoice_slug)

    # Determinar valores e comparar paid_amount com esperado
    amount_raw = data.get("amount") or data.get("paid_amount") or inner_data.get("amount") or 0
    paid_amount_raw = data.get("paid_amount") or inner_data.get("paid_amount") or 0
    
    from decimal import Decimal
    paid_amount_reais = Decimal(str(paid_amount_raw)) / 100
    amount_expected = pagamento.valor

    pagamento.paid_amount = paid_amount_reais
    pagamento.capture_method = str(data.get("capture_method") or inner_data.get("capture_method") or "")

    if paid_amount_reais < amount_expected:
        logger.warning(f"Divergência de valor no pagamento ID={pagamento.id}: Pago R$ {paid_amount_reais:.2f}, Esperado R$ {amount_expected:.2f}!")

    # Considerar tanto "paid" quanto "approved" como pago, ou se houver paid_amount > 0 no webhook
    is_approved = (
        any(s in payment_status for s in ["paid", "approved", "completed", "pago"])
        or (float(paid_amount_raw) > 0 and float(paid_amount_raw) >= float(amount_raw))
    )
    is_cancelled = any(s in payment_status for s in ["failed", "cancel", "refund"])

    logger.warning(f"Verificação de status: is_approved={is_approved}, is_cancelled={is_cancelled}, amount={amount_raw}, paid_amount={paid_amount_raw}")

    # Verificar status do pagamento
    if is_approved:
        pagamento.status = "PAGO"
        
        # Atualizar status das parcelas se houver
        for p in pagamento.parcelas:
            p.status = "PAGO"

        # Confirmar inscrição do participante
        if pagamento.inscricao:
            status_anterior = pagamento.inscricao.status
            pagamento.inscricao.status = "CONFIRMADA"
            db.commit()
            logger.warning(f"Inscrição ID={pagamento.inscricao_id} alterada para CONFIRMADA.")

            # Enviar e-mail em background se antes não estava confirmada
            if status_anterior != "CONFIRMADA":
                background_tasks.add_task(
                    enviar_email_confirmacao,
                    destinatario_email=pagamento.inscricao.usuario.email,
                    destinatario_nome=pagamento.inscricao.usuario.nome,
                    nome_evento=pagamento.inscricao.evento.titulo
                )
                logger.warning(f"E-mail de confirmação agendado para {pagamento.inscricao.usuario.email}")

    elif is_cancelled:
        pagamento.status = "CANCELADO"
        for p in pagamento.parcelas:
            p.status = "CANCELADO"
        db.commit()
        logger.warning(f"Pagamento ID={pagamento.id} cancelado via webhook.")

    return {"message": "Webhook processado com sucesso.", "status": pagamento.status}
