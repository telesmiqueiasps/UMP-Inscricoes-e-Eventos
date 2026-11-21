from sqlalchemy import Column, Integer, String, Text, DateTime, Float, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class CineflixConfig(Base):
    __tablename__ = "cineflix_configs"

    evento_id = Column(Integer, ForeignKey("eventos.id", ondelete="CASCADE"), primary_key=True)
    votacao_aberta = Column(Boolean, default=True, nullable=False)
    
    # Fantasia ativa no palco no momento (apenas esta aparece para os jurados votarem)
    fantasia_ativa_id = Column(Integer, ForeignKey("cineflix_fantasias.id", ondelete="SET NULL"), nullable=True)

    # 3 Jurados oficiais
    token_jurado_1 = Column(String(64), nullable=False)
    nome_jurado_1 = Column(String(100), default="Jurado 1", nullable=False)
    
    token_jurado_2 = Column(String(64), nullable=False)
    nome_jurado_2 = Column(String(100), default="Jurado 2", nullable=False)
    
    token_jurado_3 = Column(String(64), nullable=False)
    nome_jurado_3 = Column(String(100), default="Jurado 3", nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    evento = relationship("Evento")
    fantasia_ativa = relationship("CineflixFantasia", foreign_keys=[fantasia_ativa_id])


class CineflixFantasia(Base):
    __tablename__ = "cineflix_fantasias"

    id = Column(Integer, primary_key=True, index=True)
    evento_id = Column(Integer, ForeignKey("eventos.id", ondelete="CASCADE"), nullable=False, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True, index=True)
    
    nome_participante = Column(String(150), nullable=False)
    personagem = Column(String(150), nullable=False)  # Nome da fantasia / personagem
    universo = Column(String(150), nullable=False)    # Universo (Marvel, Disney, Star Wars, etc.)
    descricao = Column(Text, nullable=True)           # Detalhes da fantasia
    foto_url = Column(Text, nullable=True)            # Imagem de referência ou foto
    ordem_apresentacao = Column(Integer, default=0, nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    evento = relationship("Evento")
    usuario = relationship("Usuario")
    votos = relationship("CineflixVoto", back_populates="fantasia", cascade="all, delete-orphan")


class CineflixVoto(Base):
    __tablename__ = "cineflix_votos"

    id = Column(Integer, primary_key=True, index=True)
    evento_id = Column(Integer, ForeignKey("eventos.id", ondelete="CASCADE"), nullable=False, index=True)
    fantasia_id = Column(Integer, ForeignKey("cineflix_fantasias.id", ondelete="CASCADE"), nullable=False, index=True)
    numero_jurado = Column(Integer, nullable=False)  # 1, 2 ou 3

    # Categorias de Avaliação (0.0 a 10.0)
    nota_impacto_visual = Column(Float, default=0.0, nullable=False)
    nota_performance = Column(Float, default=0.0, nullable=False)
    nota_dedicacao = Column(Float, default=0.0, nullable=False)
    
    observacao = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("fantasia_id", "numero_jurado", name="uq_cineflix_fantasia_jurado"),
    )

    fantasia = relationship("CineflixFantasia", back_populates="votos")
    evento = relationship("Evento")
