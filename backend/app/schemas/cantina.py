from pydantic import BaseModel, Field
from typing import List, Optional
from decimal import Decimal
from datetime import datetime


class CantinaProdutoBase(BaseModel):
    nome: str = Field(..., min_length=1, max_length=180)
    categoria: Optional[str] = "Geral"
    imagem_url: Optional[str] = None
    quantidade_estoque: int = Field(0, ge=0)
    valor_custo: Decimal = Field(Decimal("0.00"), ge=0)
    margem_lucro: Decimal = Field(Decimal("0.00"))
    preco_venda: Decimal = Field(Decimal("0.00"), ge=0)
    ativo: bool = True


class CantinaProdutoCreate(CantinaProdutoBase):
    pass


class CantinaProdutoUpdate(BaseModel):
    nome: Optional[str] = Field(None, min_length=1, max_length=180)
    categoria: Optional[str] = None
    imagem_url: Optional[str] = None
    quantidade_estoque: Optional[int] = Field(None, ge=0)
    valor_custo: Optional[Decimal] = Field(None, ge=0)
    margem_lucro: Optional[Decimal] = None
    preco_venda: Optional[Decimal] = Field(None, ge=0)
    ativo: Optional[bool] = None


class CantinaEstoqueAjuste(BaseModel):
    delta: int  # positivo para entrada, negativo para baixa


class CantinaProdutoResponse(CantinaProdutoBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CantinaVendaItemInput(BaseModel):
    produto_id: int
    quantidade: int = Field(..., ge=1)


class CantinaVendaCreate(BaseModel):
    forma_pagamento: str  # PIX, DINHEIRO, CARTAO
    itens: List[CantinaVendaItemInput]
    taxa_cartao_percentual: Optional[Decimal] = None
    valor_recebido_dinheiro: Optional[Decimal] = None
    cliente_nome: Optional[str] = None
    observacao: Optional[str] = None


class CantinaVendaItemResponse(BaseModel):
    id: int
    produto_id: Optional[int] = None
    produto_nome: str
    quantidade: int
    valor_custo_unitario: Decimal
    preco_venda_unitario: Decimal
    subtotal_custo: Decimal
    subtotal_venda: Decimal

    class Config:
        from_attributes = True


class CantinaVendaResponse(BaseModel):
    id: int
    forma_pagamento: str
    valor_custo_total: Decimal
    valor_subtotal: Decimal
    taxa_cartao_percentual: Decimal
    valor_taxa_cartao: Decimal
    valor_total_cobrado: Decimal
    valor_recebido_dinheiro: Optional[Decimal] = None
    valor_troco: Optional[Decimal] = None
    cliente_nome: Optional[str] = None
    observacao: Optional[str] = None
    operador_id: Optional[int] = None
    operador_nome: Optional[str] = None
    status: str
    created_at: datetime
    itens: List[CantinaVendaItemResponse] = []

    class Config:
        from_attributes = True


class CantinaConfigUpdate(BaseModel):
    taxa_maquina_cartao: Decimal = Field(..., ge=0, le=99)
    modo_calculo_taxa: Optional[str] = "REPASSE"  # REPASSE (cobrar por dentro) ou ACRESCIMO (simples)

