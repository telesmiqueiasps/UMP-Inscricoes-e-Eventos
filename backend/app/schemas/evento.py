from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from decimal import Decimal


class EventoBase(BaseModel):
    titulo: str
    descricao: Optional[str] = None
    data_inicio: datetime
    data_fim: datetime
    local: Optional[str] = None
    valor: Decimal
    max_participantes: Optional[int] = None
    max_parcelas: int = 1
    ativo: bool = True
    link_pagamento_cartao: Optional[str] = None
    link_pagamento_pix: Optional[str] = None
    campos_formulario: Optional[str] = None
    fotos: Optional[str] = None


class EventoCreate(EventoBase):
    pass


class EventoUpdate(BaseModel):
    titulo: Optional[str] = None
    descricao: Optional[str] = None
    data_inicio: Optional[datetime] = None
    data_fim: Optional[datetime] = None
    local: Optional[str] = None
    valor: Optional[Decimal] = None
    max_participantes: Optional[int] = None
    max_parcelas: Optional[int] = None
    ativo: Optional[bool] = None
    link_pagamento_cartao: Optional[str] = None
    link_pagamento_pix: Optional[str] = None
    campos_formulario: Optional[str] = None
    fotos: Optional[str] = None


class EventoResponse(EventoBase):
    id: int
    vagas_restantes: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
