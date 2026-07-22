from fastapi import APIRouter, Depends, HTTPException, status, Request, BackgroundTasks
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.pagamento import Pagamento
from app.models.inscricao import Inscricao
from app.models.usuario import Usuario
from app.schemas.pagamento import WebhookInfinitePaySchema
from app.services.email import enviar_email_confirmacao

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
    except Exception:
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
        or data.get("event")
        or ""
    )
    payment_status = str(status_raw).lower()

    pagamento = None
    if order_nsu or invoice_slug:
        # Buscar pagamento no banco por order_nsu ou invoice_slug
        pagamento = db.query(Pagamento).filter(
            (Pagamento.order_nsu == order_nsu) | (Pagamento.invoice_slug == invoice_slug)
        ).first()

    # Se não encontrar por order_nsu, tentar buscar pelo e-mail do cliente (útil para links manuais do app)
    if not pagamento:
        customer_data = data.get("customer", {}) if isinstance(data.get("customer"), dict) else {}
        if not customer_data:
            customer_data = inner_data.get("customer", {}) if isinstance(inner_data.get("customer"), dict) else {}
        
        customer_email = customer_data.get("email")
        if customer_email:
            # Buscar usuário pelo e-mail
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

    if not pagamento:
        return {"message": "Pagamento correspondente não encontrado.", "status": "ignored"}

    # Atualizar campos adicionais
    if transaction_nsu:
        pagamento.transaction_nsu = str(transaction_nsu)
    if receipt_url:
        pagamento.receipt_url = str(receipt_url)
    if invoice_slug:
        pagamento.invoice_slug = str(invoice_slug)

    is_approved = any(s in payment_status for s in ["paid", "approved", "completed", "pago"])
    is_cancelled = any(s in payment_status for s in ["failed", "cancel", "refund"])

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

            # Enviar e-mail em background se antes não estava confirmada
            if status_anterior != "CONFIRMADA":
                background_tasks.add_task(
                    enviar_email_confirmacao,
                    destinatario_email=pagamento.inscricao.usuario.email,
                    destinatario_nome=pagamento.inscricao.usuario.nome,
                    nome_evento=pagamento.inscricao.evento.titulo
                )

    elif is_cancelled:
        pagamento.status = "CANCELADO"
        for p in pagamento.parcelas:
            p.status = "CANCELADO"
        db.commit()

    return {"message": "Webhook processado com sucesso.", "status": pagamento.status}
