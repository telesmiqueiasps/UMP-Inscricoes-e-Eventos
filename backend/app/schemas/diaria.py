import json
from pydantic import BaseModel, field_validator
from typing import Optional, Dict, Any, List
from datetime import datetime
from decimal import Decimal


class DiariaTriagemCreate(BaseModel):
    evento_id: int
    dias_selecionados: List[str]
    dados_extras: Optional[Dict[str, Any]] = None


class EventoDiariaResponse(BaseModel):
    id: int
    titulo: str
    descricao: Optional[str] = None
    data_inicio: Optional[datetime] = None
    data_fim: Optional[datetime] = None
    local: Optional[str] = None
    valor: Optional[Decimal] = None

    class Config:
        from_attributes = True


class UsuarioDiariaResponse(BaseModel):
    id: int
    nome: Optional[str] = None
    email: Optional[str] = None
    cpf: Optional[str] = None
    telefone: Optional[str] = None
    is_admin: Optional[bool] = False
    perfil_acesso: Optional[str] = "global"
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DiariaTriagemResponse(BaseModel):
    id: int
    usuario_id: int
    evento_id: int
    dias_selecionados: List[str] = []
    quantidade_dias: Optional[int] = 1
    valor_total: Optional[Decimal] = Decimal("0.00")
    status: Optional[str] = "PENDENTE_PAGAMENTO"
    forma_pagamento: Optional[str] = "INFINITEPAY"
    dados_extras: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None
    checkout_url: Optional[str] = None
    evento: Optional[EventoDiariaResponse] = None

    @field_validator("dias_selecionados", mode="before")
    @classmethod
    def normalizar_dias(cls, v):
        if v is None:
            return []
        if isinstance(v, list):
            return [str(item) for item in v if item is not None]
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return [str(item) for item in parsed if item is not None]
            except Exception:
                pass
            return [v.strip()] if v.strip() else []
        return [str(v)]

    class Config:
        from_attributes = True


class AcomodacaoDiariaResponse(BaseModel):
    id: int
    nome: str
    tipo: Optional[str] = "Quarto"
    capacidade: Optional[int] = 0
    genero_restrito: Optional[str] = None
    cor: Optional[str] = None
    descricao: Optional[str] = None

    class Config:
        from_attributes = True


class InscricaoDiariaResponse(BaseModel):
    id: int
    usuario_id: int
    evento_id: int
    dias_selecionados: List[str] = []
    quantidade_dias: Optional[int] = 1
    valor_total: Optional[Decimal] = Decimal("0.00")
    status: Optional[str] = "CONFIRMADA"
    forma_pagamento: Optional[str] = None
    dados_extras: Optional[Dict[str, Any]] = None
    codigo_checkin: Optional[str] = None
    checkin_realizado: Optional[bool] = False
    checkin_data: Optional[datetime] = None
    receipt_url: Optional[str] = None
    order_nsu: Optional[str] = None
    transaction_nsu: Optional[str] = None
    acomodacao_id: Optional[int] = None
    acomodacao: Optional[AcomodacaoDiariaResponse] = None
    created_at: Optional[datetime] = None

    usuario: Optional[UsuarioDiariaResponse] = None
    evento: Optional[EventoDiariaResponse] = None

    @field_validator("dias_selecionados", mode="before")
    @classmethod
    def normalizar_dias(cls, v):
        if v is None:
            return []
        if isinstance(v, list):
            return [str(item) for item in v if item is not None]
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return [str(item) for item in parsed if item is not None]
            except Exception:
                pass
            return [v.strip()] if v.strip() else []
        return [str(v)]

    class Config:
        from_attributes = True


class DiariaConfigUpdate(BaseModel):
    diarias_habilitadas: bool
    config_diarias: Optional[Any] = None
    campos_formulario_diaria: Optional[str] = None


class DiariaUpdateStatus(BaseModel):
    status: str  # CONFIRMADA, CANCELADA
