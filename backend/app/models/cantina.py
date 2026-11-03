from sqlalchemy import Column, Integer, String, Boolean, DateTime, Numeric, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class CantinaProduto(Base):
    __tablename__ = "cantina_produtos"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(180), nullable=False)
    categoria = Column(String(100), nullable=True, default="Geral")
    imagem_url = Column(Text, nullable=True)
    quantidade_estoque = Column(Integer, nullable=False, default=0)
    valor_custo = Column(Numeric(10, 2), nullable=False, default=0.00)
    margem_lucro = Column(Numeric(10, 2), nullable=False, default=0.00)
    preco_venda = Column(Numeric(10, 2), nullable=False, default=0.00)
    ativo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    itens_venda = relationship("CantinaVendaItem", back_populates="produto")


class CantinaVenda(Base):
    __tablename__ = "cantina_vendas"

    id = Column(Integer, primary_key=True, index=True)
    forma_pagamento = Column(String(40), nullable=False)  # PIX, DINHEIRO, CARTAO
    valor_custo_total = Column(Numeric(10, 2), nullable=False, default=0.00)
    valor_subtotal = Column(Numeric(10, 2), nullable=False, default=0.00)
    taxa_cartao_percentual = Column(Numeric(6, 2), nullable=False, default=0.00)
    valor_taxa_cartao = Column(Numeric(10, 2), nullable=False, default=0.00)
    valor_total_cobrado = Column(Numeric(10, 2), nullable=False, default=0.00)
    valor_recebido_dinheiro = Column(Numeric(10, 2), nullable=True)
    valor_troco = Column(Numeric(10, 2), nullable=True)
    cliente_nome = Column(String(150), nullable=True)
    observacao = Column(Text, nullable=True)
    operador_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    operador_nome = Column(String(150), nullable=True)
    status = Column(String(30), nullable=False, default="CONCLUIDA")  # CONCLUIDA, CANCELADA
    created_at = Column(DateTime, default=datetime.utcnow)

    itens = relationship("CantinaVendaItem", back_populates="venda", cascade="all, delete-orphan")


class CantinaVendaItem(Base):
    __tablename__ = "cantina_venda_itens"

    id = Column(Integer, primary_key=True, index=True)
    venda_id = Column(Integer, ForeignKey("cantina_vendas.id", ondelete="CASCADE"), nullable=False, index=True)
    produto_id = Column(Integer, ForeignKey("cantina_produtos.id", ondelete="SET NULL"), nullable=True, index=True)
    produto_nome = Column(String(180), nullable=False)
    quantidade = Column(Integer, nullable=False, default=1)
    valor_custo_unitario = Column(Numeric(10, 2), nullable=False, default=0.00)
    preco_venda_unitario = Column(Numeric(10, 2), nullable=False, default=0.00)
    subtotal_custo = Column(Numeric(10, 2), nullable=False, default=0.00)
    subtotal_venda = Column(Numeric(10, 2), nullable=False, default=0.00)

    venda = relationship("CantinaVenda", back_populates="itens")
    produto = relationship("CantinaProduto", back_populates="itens_venda")

