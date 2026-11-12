from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class Acomodacao(Base):
    __tablename__ = "acomodacoes"

    id = Column(Integer, primary_key=True, index=True)
    evento_id = Column(Integer, ForeignKey("eventos.id", ondelete="CASCADE"), nullable=False, index=True)
    nome = Column(String(150), nullable=False)
    tipo = Column(String(60), default="Quarto", nullable=False)
    capacidade = Column(Integer, default=10, nullable=False)
    genero_restrito = Column(String(30), nullable=True)  # MASCULINO, FEMININO, MISTO ou None
    descricao = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    evento = relationship("Evento", back_populates="acomodacoes")
    inscricoes = relationship("Inscricao", back_populates="acomodacao")
    diarias = relationship("InscricaoDiaria", back_populates="acomodacao")

    def to_summary_dict(self):
        """Retorna resumo da acomodação para exibição no check-in e portal do participante."""
        return {
            "id": self.id,
            "nome": self.nome,
            "tipo": self.tipo,
            "descricao": self.descricao
        }
