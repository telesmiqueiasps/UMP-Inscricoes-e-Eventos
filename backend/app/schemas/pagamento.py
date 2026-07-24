from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal


class ParcelaResponse(BaseModel):
    id: int
    pagamento_id: int
    numero: int
    vencimento: date
    valor: Decimal
    qr_code_pix: Optional[str] = None
    copia_cola_pix: Optional[str] = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class PagamentoResponse(BaseModel):
    id: int
    inscricao_id: int
    forma_pagamento: str
    valor: Decimal
    status: str
    qr_code_pix: Optional[str] = None
    copia_cola_pix: Optional[str] = None
    transaction_nsu: Optional[str] = None
    receipt_url: Optional[str] = None
    order_nsu: Optional[str] = None
    invoice_slug: Optional[str] = None
    paid_amount: Optional[Decimal] = None
    capture_method: Optional[str] = None
    created_at: datetime
    parcelas: List[ParcelaResponse] = []

    usuario_nome: Optional[str] = None
    usuario_cpf: Optional[str] = None
    usuario_email: Optional[str] = None

    class Config:
        from_attributes = True


class WebhookInfinitePaySchema(BaseModel):
    order_nsu: Optional[str] = None
    transaction_nsu: Optional[str] = None
    status: Optional[str] = None
    receipt_url: Optional[str] = None
    invoice_slug: Optional[str] = None
    amount: Optional[int] = None
