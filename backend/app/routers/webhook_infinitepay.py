from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.pagamento import Pagamento
from app.models.inscricao import Inscricao
from app.schemas.pagamento import WebhookInfinitePaySchema

router = APIRouter(prefix="/webhook", tags=["Webhooks"])


@router.post("/infinitepay", status_code=status.HTTP_200_OK)
async def webhook_infinitepay(request: Request, db: Session = Depends(get_db)):
    """
    Webhook para receber notificações de pagamentos efetuados via InfinitePay.
    Atualiza o pagamento, salva transaction_nsu, receipt_url, order_nsu e invoice_slug,
    e confirma a inscrição correspondente.
    """
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Payload JSON inválido")

    order_nsu = data.get("order_nsu")
    invoice_slug = data.get("invoice_slug")
    transaction_nsu = data.get("transaction_nsu")
    receipt_url = data.get("receipt_url")
    payment_status = str(data.get("status", "")).lower()

    if not order_nsu and not invoice_slug:
        return {"message": "Identificador de ordem não fornecido, ignorado."}

    # Buscar pagamento no banco por order_nsu ou invoice_slug
    pagamento = db.query(Pagamento).filter(
        (Pagamento.order_nsu == order_nsu) | (Pagamento.invoice_slug == invoice_slug)
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

    # Verificar status do pagamento
    if payment_status in ["paid", "approved", "completed", "pago"]:
        pagamento.status = "PAGO"
        
        # Atualizar status das parcelas se houver
        for p in pagamento.parcelas:
            p.status = "PAGO"

        # Confirmar inscrição do participante
        if pagamento.inscricao:
            pagamento.inscricao.status = "CONFIRMADA"

    elif payment_status in ["failed", "canceled", "cancelled", "refunded"]:
        pagamento.status = "CANCELADO"
        for p in pagamento.parcelas:
            p.status = "CANCELADO"

    db.commit()
    return {"message": "Webhook processado com sucesso.", "status": pagamento.status}
