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
    cor = Column(String(30), nullable=True)  # VERDE, LARANJA ou None (vinculado a Gincana)
    descricao = Column(Text, nullable=True)
    lider_inscricao_id = Column(Integer, ForeignKey("inscricoes.id", ondelete="SET NULL"), nullable=True)
    lider_diaria_id = Column(Integer, ForeignKey("inscricoes_diarias.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    evento = relationship("Evento", back_populates="acomodacoes")
    inscricoes = relationship("Inscricao", back_populates="acomodacao", foreign_keys="Inscricao.acomodacao_id")
    diarias = relationship("InscricaoDiaria", back_populates="acomodacao", foreign_keys="InscricaoDiaria.acomodacao_id")
    lider_inscricao = relationship("Inscricao", foreign_keys=[lider_inscricao_id], lazy="joined")
    lider_diaria = relationship("InscricaoDiaria", foreign_keys=[lider_diaria_id], lazy="joined")

    def get_lider_info(self):
        """Retorna os dados do líder da acomodação (se definido)."""
        reg = None
        tipo = None
        if self.lider_inscricao:
            reg = self.lider_inscricao
            tipo = "REGULAR"
        elif self.lider_diaria:
            reg = self.lider_diaria
            tipo = "DIARIA"

        if not reg:
            return None

        usuario = getattr(reg, "usuario", None)
        extras = reg.dados_extras if isinstance(reg.dados_extras, dict) else {}

        nome = (usuario.nome if usuario else "") or "Líder do Quarto"
        telefone = (usuario.telefone if usuario and usuario.telefone else extras.get("telefone") or extras.get("whatsapp") or extras.get("contato")) or ""

        return {
            "registro_id": reg.id,
            "tipo": tipo,
            "nome": nome,
            "telefone": telefone,
            "email": usuario.email if usuario else ""
        }

    def to_summary_dict(self):
        """Retorna resumo da acomodação para exibição no check-in e portal do participante."""
        return {
            "id": self.id,
            "nome": self.nome,
            "tipo": self.tipo,
            "descricao": self.descricao,
            "cor": self.cor,
            "lider": self.get_lider_info()
        }
