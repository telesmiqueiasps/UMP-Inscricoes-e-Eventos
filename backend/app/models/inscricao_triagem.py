from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, JSON, Date
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class InscricaoTriagem(Base):
    __tablename__ = "inscricoes_triagem"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    evento_id = Column(Integer, ForeignKey("eventos.id"), nullable=False)
    status = Column(String(50), default="PENDENTE_PAGAMENTO", nullable=False) # PENDENTE_PAGAMENTO, CONVERTIDA, EXPIRADA
    forma_pagamento = Column(String(50), nullable=True) # PIX, INFINITEPAY, PARCELADO
    num_parcelas = Column(Integer, default=1, nullable=False)
    data_primeira_parcela = Column(Date, nullable=True)
    valor_total = Column(Numeric(10, 2), nullable=False)
    dados_extras = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    usuario = relationship("Usuario")
    evento = relationship("Evento")
