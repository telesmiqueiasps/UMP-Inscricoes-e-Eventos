from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class InscricaoGratuita(Base):
    __tablename__ = "inscricoes_gratuitas"

    id = Column(Integer, primary_key=True, index=True)
    evento_id = Column(Integer, ForeignKey("eventos.id", ondelete="CASCADE"), nullable=False, index=True)
    nome = Column(String(150), nullable=False)
    contato = Column(String(50), nullable=True)  # Telefone / WhatsApp
    sexo = Column(String(30), nullable=True)     # MASCULINO, FEMININO, etc.
    observacao = Column(Text, nullable=True)
    codigo_checkin = Column(String(100), unique=True, nullable=True, index=True)
    checkin_realizado = Column(Boolean, default=False, nullable=False)
    checkin_data = Column(DateTime, nullable=True)
    acomodacao_id = Column(Integer, ForeignKey("acomodacoes.id", ondelete="SET NULL"), nullable=True, index=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    evento = relationship("Evento", back_populates="gratuidades")
    acomodacao = relationship("Acomodacao", back_populates="gratuidades", foreign_keys=[acomodacao_id])
