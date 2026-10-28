from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class Gincana(Base):
    __tablename__ = "gincanas"

    id = Column(Integer, primary_key=True, index=True)
    evento_id = Column(Integer, ForeignKey("eventos.id", ondelete="SET NULL"), nullable=True, index=True)
    titulo = Column(String(200), default="Gincana UMP", nullable=False)
    ativa = Column(Boolean, default=True, nullable=False)

    # Configurações Equipe 1
    nome_equipe_1 = Column(String(100), default="Equipe 1", nullable=False)
    cor_equipe_1 = Column(String(30), default="#2563EB", nullable=False)

    # Configurações Equipe 2
    nome_equipe_2 = Column(String(100), default="Equipe 2", nullable=False)
    cor_equipe_2 = Column(String(30), default="#DC2626", nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    evento = relationship("Evento", backref="gincanas")
    pontos = relationship("GincanaPonto", back_populates="gincana", cascade="all, delete-orphan", order_by="desc(GincanaPonto.created_at)")


class GincanaPonto(Base):
    __tablename__ = "gincana_pontos"

    id = Column(Integer, primary_key=True, index=True)
    gincana_id = Column(Integer, ForeignKey("gincanas.id", ondelete="CASCADE"), nullable=False, index=True)
    equipe = Column(Integer, nullable=False)  # 1 ou 2
    titulo = Column(String(200), nullable=False)
    descricao = Column(Text, nullable=True)
    pontos = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    gincana = relationship("Gincana", back_populates="pontos")
