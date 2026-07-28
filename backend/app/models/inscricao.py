from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, JSON, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class Inscricao(Base):
    __tablename__ = "inscricoes"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    evento_id = Column(Integer, ForeignKey("eventos.id"), nullable=False)
    status = Column(String(50), default="PENDENTE", nullable=False)  # PENDENTE, CONFIRMADA, CANCELADA
    forma_pagamento = Column(String(50), nullable=True)             # PIX, INFINITEPAY, PARCELADO
    valor_total = Column(Numeric(10, 2), nullable=False)
    dados_extras = Column(JSON, nullable=True)
    codigo_checkin = Column(String(100), unique=True, nullable=True)
    checkin_realizado = Column(Boolean, default=False, nullable=False)
    checkin_data = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    usuario = relationship("Usuario", back_populates="inscricoes")
    evento = relationship("Evento", back_populates="inscricoes")
    pagamentos = relationship("Pagamento", back_populates="inscricao", cascade="all, delete-orphan")
