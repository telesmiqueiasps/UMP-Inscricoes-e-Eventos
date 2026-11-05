from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class OficinaConfig(Base):
    __tablename__ = "oficina_config"

    id = Column(Integer, primary_key=True, index=True)
    aba_participante_visivel = Column(Boolean, default=True, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Oficina(Base):
    __tablename__ = "oficinas"

    id = Column(Integer, primary_key=True, index=True)
    evento_id = Column(Integer, ForeignKey("eventos.id", ondelete="CASCADE"), nullable=False, index=True)
    titulo = Column(String(200), nullable=False)
    descricao = Column(Text, nullable=True)
    ministrante = Column(String(160), nullable=True)
    foto_ministrante = Column(Text, nullable=True)
    local = Column(String(160), nullable=True)
    horario = Column(String(120), nullable=True)
    capacidade = Column(Integer, default=30, nullable=False)
    ativa = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    evento = relationship("Evento")
    inscricoes = relationship("OficinaInscricao", back_populates="oficina", cascade="all, delete-orphan")


class OficinaInscricao(Base):
    __tablename__ = "oficina_inscricoes"
    __table_args__ = (
        UniqueConstraint("evento_id", "usuario_id", name="uq_oficina_evento_usuario"),
    )

    id = Column(Integer, primary_key=True, index=True)
    oficina_id = Column(Integer, ForeignKey("oficinas.id", ondelete="CASCADE"), nullable=False, index=True)
    evento_id = Column(Integer, ForeignKey("eventos.id", ondelete="CASCADE"), nullable=False, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    oficina = relationship("Oficina", back_populates="inscricoes")
    evento = relationship("Evento")
    usuario = relationship("Usuario")
