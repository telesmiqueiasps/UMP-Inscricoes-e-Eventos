from sqlalchemy import Column, String, Text, DateTime
from datetime import datetime
from app.core.database import Base


class Configuracao(Base):
    __tablename__ = "configuracoes"

    chave = Column(String(100), primary_key=True, index=True)
    valor = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
