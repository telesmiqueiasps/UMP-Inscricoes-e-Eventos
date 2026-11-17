from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime


class GratuitaCreate(BaseModel):
    nome: str
    contato: Optional[str] = None
    sexo: Optional[str] = None
    observacao: Optional[str] = None


class GratuitaUpdate(BaseModel):
    nome: Optional[str] = None
    contato: Optional[str] = None
    sexo: Optional[str] = None
    observacao: Optional[str] = None


class GratuitaResponse(BaseModel):
    id: int
    evento_id: int
    nome: str
    contato: Optional[str] = None
    sexo: Optional[str] = None
    observacao: Optional[str] = None
    codigo_checkin: Optional[str] = None
    checkin_realizado: bool = False
    checkin_data: Optional[datetime] = None
    acomodacao_id: Optional[int] = None
    acomodacao: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
