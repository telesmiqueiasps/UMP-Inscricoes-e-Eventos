from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime


class AchadoPerdidoBase(BaseModel):
    evento_id: Optional[int] = None
    titulo: str
    descricao: Optional[str] = None
    local_encontrado: Optional[str] = None
    data_encontrado: Optional[str] = None
    foto_url: str


class AchadoPerdidoCreate(AchadoPerdidoBase):
    pass


class AchadoPerdidoUpdate(BaseModel):
    evento_id: Optional[int] = None
    titulo: Optional[str] = None
    descricao: Optional[str] = None
    local_encontrado: Optional[str] = None
    data_encontrado: Optional[str] = None
    foto_url: Optional[str] = None
    status: Optional[str] = None


class AchadoPerdidoEntregarRequest(BaseModel):
    entregue_para_nome: Optional[str] = None
    entregue_observacao: Optional[str] = None


class AchadoPerdidoReivindicarRequest(BaseModel):
    mensagem: Optional[str] = None


class ReivindicanteInfo(BaseModel):
    id: int
    nome: str
    email: Optional[str] = None
    telefone: Optional[str] = None


class AchadoPerdidoResponse(BaseModel):
    id: int
    evento_id: Optional[int] = None
    evento_nome: Optional[str] = None
    titulo: str
    descricao: Optional[str] = None
    local_encontrado: Optional[str] = None
    data_encontrado: Optional[str] = None
    foto_url: str
    status: str
    
    # Reivindicação
    reivindicado_por_usuario_id: Optional[int] = None
    reivindicado_por: Optional[ReivindicanteInfo] = None
    reivindicado_em: Optional[datetime] = None
    reivindicacao_mensagem: Optional[str] = None
    sou_eu_que_reivindiquei: Optional[bool] = False

    # Entrega
    entregue_em: Optional[datetime] = None
    entregue_por_nome: Optional[str] = None
    entregue_para_nome: Optional[str] = None
    entregue_observacao: Optional[str] = None

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
