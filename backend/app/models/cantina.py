from sqlalchemy import Column, Integer, String, Boolean, DateTime, Numeric, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class CantinaCaixa(Base):
    __tablename__ = "cantina_caixas"

    id = Column(Integer, primary_key=True, index=True)
    data_referencia = Column(String(30), nullable=False)  # Ex: "2026-11-03" ou "03/11/2026"
    descricao = Column(String(150), nullable=True)        # Ex: "1º Dia - Sexta-feira"
    valor_inicial = Column(Numeric(10, 2), nullable=False, default=0.00)
    valor_fechamento_informado = Column(Numeric(10, 2), nullable=True)
    observacao_abertura = Column(Text, nullable=True)
    observacao_fechamento = Column(Text, nullable=True)
    status = Column(String(30), nullable=False, default="ABERTO")  # ABERTO, FECHADO
    aberto_por_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    aberto_por_nome = Column(String(150), nullable=True)
    fechado_por_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    fechado_por_nome = Column(String(150), nullable=True)
    opened_at = Column(DateTime, default=datetime.utcnow)
    closed_at = Column(DateTime, nullable=True)

    vendas = relationship("CantinaVenda", back_populates="caixa")
    movimentacoes = relationship("CantinaCaixaMovimentacao", back_populates="caixa", cascade="all, delete-orphan")


class CantinaCaixaMovimentacao(Base):
    __tablename__ = "cantina_caixa_movimentacoes"

    id = Column(Integer, primary_key=True, index=True)
    caixa_id = Column(Integer, ForeignKey("cantina_caixas.id", ondelete="CASCADE"), nullable=False, index=True)
    tipo = Column(String(30), nullable=False)  # SUPRIMENTO (entrada extra no caixa) ou SANGRIA (retirada/despesa)
    valor = Column(Numeric(10, 2), nullable=False, default=0.00)
    motivo = Column(String(200), nullable=False)
    operador_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    operador_nome = Column(String(150), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    caixa = relationship("CantinaCaixa", back_populates="movimentacoes")


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
    caixa_id = Column(Integer, ForeignKey("cantina_caixas.id", ondelete="SET NULL"), nullable=True, index=True)
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

    caixa = relationship("CantinaCaixa", back_populates="vendas")
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
