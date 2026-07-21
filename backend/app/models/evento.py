from sqlalchemy import Column, Integer, String, Text, Numeric, Boolean, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class Evento(Base):
    __tablename__ = "eventos"

    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String(200), nullable=False)
    descricao = Column(Text, nullable=True)
    data_inicio = Column(DateTime, nullable=False)
    data_fim = Column(DateTime, nullable=False)
    local = Column(String(255), nullable=True)
    valor = Column(Numeric(10, 2), nullable=False)
    max_participantes = Column(Integer, nullable=True)
    max_parcelas = Column(Integer, default=1, nullable=False)
    ativo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    inscricoes = relationship("Inscricao", back_populates="evento", cascade="all, delete-orphan")
