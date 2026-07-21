from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime
from decimal import Decimal
from app.schemas.usuario import UsuarioResponse
from app.schemas.evento import EventoResponse


class InscricaoCreate(BaseModel):
    evento_id: int
    forma_pagamento: Optional[str] = "PIX"  # PIX, INFINITEPAY, PARCELADO
    num_parcelas: Optional[int] = 1
    dados_extras: Optional[Dict[str, Any]] = None


class InscricaoUpdateStatus(BaseModel):
    status: str  # PENDENTE, CONFIRMADA, CANCELADA


class InscricaoResponse(BaseModel):
    id: int
    usuario_id: int
    evento_id: int
    status: str
    forma_pagamento: Optional[str] = None
    valor_total: Decimal
    dados_extras: Optional[Dict[str, Any]] = None
    created_at: datetime

    usuario: Optional[UsuarioResponse] = None
    evento: Optional[EventoResponse] = None

    class Config:
        from_attributes = True
