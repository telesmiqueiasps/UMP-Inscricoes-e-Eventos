from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime
from decimal import Decimal
from app.schemas.usuario import UsuarioResponse
from app.schemas.evento import EventoResponse
from app.schemas.pagamento import PagamentoResponse


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
    codigo_checkin: Optional[str] = None
    checkin_realizado: bool = False
    checkin_data: Optional[datetime] = None
    created_at: datetime

    usuario: Optional[UsuarioResponse] = None
    evento: Optional[EventoResponse] = None
    pagamentos: Optional[List[PagamentoResponse]] = []

class InscricaoTriagemCreate(BaseModel):
    evento_id: int
    forma_pagamento: Optional[str] = "PIX"
    num_parcelas: Optional[int] = 1
    data_primeira_parcela: Optional[str] = None
    dados_extras: Optional[Dict[str, Any]] = None


class InscricaoTriagemResponse(BaseModel):
    id: int
    usuario_id: int
    evento_id: int
    status: str
    forma_pagamento: Optional[str] = None
    num_parcelas: int = 1
    data_primeira_parcela: Optional[Any] = None
    valor_total: Decimal
    dados_extras: Optional[Dict[str, Any]] = None
    created_at: datetime
    evento: Optional[EventoResponse] = None

    class Config:
        from_attributes = True

