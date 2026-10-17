from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, JSON, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class DiariaTriagem(Base):
    __tablename__ = "diarias_triagem"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    evento_id = Column(Integer, ForeignKey("eventos.id"), nullable=False)
    dias_selecionados = Column(JSON, nullable=False)  # Lista de strings: ["2026-11-14", "2026-11-15"]
    quantidade_dias = Column(Integer, default=1, nullable=False)
    valor_total = Column(Numeric(10, 2), nullable=False)
    status = Column(String(50), default="PENDENTE_PAGAMENTO", nullable=False)  # PENDENTE_PAGAMENTO, CONVERTIDA, CANCELADA
    forma_pagamento = Column(String(50), default="INFINITEPAY", nullable=False)
    dados_extras = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    usuario = relationship("Usuario", back_populates="diarias_triagem")
    evento = relationship("Evento", back_populates="diarias_triagem")


class InscricaoDiaria(Base):
    __tablename__ = "inscricoes_diarias"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    evento_id = Column(Integer, ForeignKey("eventos.id"), nullable=False)
    dias_selecionados = Column(JSON, nullable=False)  # Lista de strings: ["2026-11-14", "2026-11-15"]
    quantidade_dias = Column(Integer, default=1, nullable=False)
    valor_total = Column(Numeric(10, 2), nullable=False)
    status = Column(String(50), default="CONFIRMADA", nullable=False)  # CONFIRMADA, CANCELADA
    forma_pagamento = Column(String(50), default="INFINITEPAY", nullable=False)
    dados_extras = Column(JSON, nullable=True)
    codigo_checkin = Column(String(100), unique=True, nullable=True)
    checkin_realizado = Column(Boolean, default=False, nullable=False)
    checkin_data = Column(DateTime, nullable=True)

    # Dados da transação InfinitePay
    transaction_nsu = Column(String(100), nullable=True)
    receipt_url = Column(String(500), nullable=True)
    order_nsu = Column(String(100), nullable=True)
    invoice_slug = Column(String(250), nullable=True)
    paid_amount = Column(Numeric(10, 2), nullable=True)
    capture_method = Column(String(50), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    usuario = relationship("Usuario", back_populates="diarias")
    evento = relationship("Evento", back_populates="diarias")
