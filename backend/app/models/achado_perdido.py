from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class AchadoPerdido(Base):
    __tablename__ = "achados_perdidos"

    id = Column(Integer, primary_key=True, index=True)
    evento_id = Column(Integer, ForeignKey("eventos.id", ondelete="SET NULL"), nullable=True, index=True)
    titulo = Column(String(160), nullable=False)
    descricao = Column(Text, nullable=True)
    local_encontrado = Column(String(160), nullable=True)
    data_encontrado = Column(String(30), nullable=True)
    foto_url = Column(Text, nullable=False)
    
    # Status possíveis: 'DISPONIVEL', 'REIVINDICADO', 'ENTREGUE'
    status = Column(String(30), default="DISPONIVEL", nullable=False, index=True)

    # Reivindicação pelo participante
    reivindicado_por_usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True, index=True)
    reivindicado_em = Column(DateTime(timezone=True), nullable=True)
    reivindicacao_mensagem = Column(Text, nullable=True)

    # Entrega realizada pela organização
    entregue_em = Column(DateTime(timezone=True), nullable=True)
    entregue_por_nome = Column(String(150), nullable=True)
    entregue_para_nome = Column(String(150), nullable=True)
    entregue_observacao = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    evento = relationship("Evento")
    reivindicado_por = relationship("Usuario", foreign_keys=[reivindicado_por_usuario_id])
