from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class Pagamento(Base):
    __tablename__ = "pagamentos"

    id = Column(Integer, primary_key=True, index=True)
    inscricao_id = Column(Integer, ForeignKey("inscricoes.id"), nullable=False)
    forma_pagamento = Column(String(50), nullable=False)  # PIX, INFINITEPAY, PARCELADO
    valor = Column(Numeric(10, 2), nullable=False)
    status = Column(String(50), default="PENDENTE", nullable=False)  # PENDENTE, PAGO, CANCELADO
    qr_code_pix = Column(Text, nullable=True)
    copia_cola_pix = Column(Text, nullable=True)

    # Dados InfinitePay
    transaction_nsu = Column(String(100), nullable=True)
    receipt_url = Column(String(500), nullable=True)
    order_nsu = Column(String(100), nullable=True)
    invoice_slug = Column(String(250), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    inscricao = relationship("Inscricao", back_populates="pagamentos")
    parcelas = relationship("Parcela", back_populates="pagamento", cascade="all, delete-orphan")
