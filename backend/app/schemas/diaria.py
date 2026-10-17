from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime
from decimal import Decimal
from app.schemas.usuario import UsuarioResponse
from app.schemas.evento import EventoResponse


class DiariaTriagemCreate(BaseModel):
    evento_id: int
    dias_selecionados: List[str]
    dados_extras: Optional[Dict[str, Any]] = None


class DiariaTriagemResponse(BaseModel):
    id: int
    usuario_id: int
    evento_id: int
    dias_selecionados: List[str]
    quantidade_dias: int
    valor_total: Decimal
    status: str
    forma_pagamento: Optional[str] = "INFINITEPAY"
    dados_extras: Optional[Dict[str, Any]] = None
    created_at: datetime
    checkout_url: Optional[str] = None
    evento: Optional[EventoResponse] = None

    class Config:
        from_attributes = True


class InscricaoDiariaResponse(BaseModel):
    id: int
    usuario_id: int
    evento_id: int
    dias_selecionados: List[str]
    quantidade_dias: int
    valor_total: Decimal
    status: str
    forma_pagamento: Optional[str] = None
    dados_extras: Optional[Dict[str, Any]] = None
    codigo_checkin: Optional[str] = None
    checkin_realizado: bool = False
    checkin_data: Optional[datetime] = None
    receipt_url: Optional[str] = None
    order_nsu: Optional[str] = None
    transaction_nsu: Optional[str] = None
    created_at: datetime

    usuario: Optional[UsuarioResponse] = None
    evento: Optional[EventoResponse] = None

    class Config:
        from_attributes = True


class DiariaConfigUpdate(BaseModel):
    diarias_habilitadas: bool
    config_diarias: Optional[Any] = None
    campos_formulario_diaria: Optional[str] = None


class DiariaUpdateStatus(BaseModel):
    status: str  # CONFIRMADA, CANCELADA
