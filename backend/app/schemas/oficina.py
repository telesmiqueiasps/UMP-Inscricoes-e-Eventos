from pydantic import BaseModel, Field
from typing import Optional


class OficinaCreate(BaseModel):
    evento_id: int
    titulo: str = Field(..., min_length=1, max_length=200)
    descricao: Optional[str] = None
    ministrante: Optional[str] = Field(None, max_length=160)
    foto_ministrante: Optional[str] = None
    local: Optional[str] = Field(None, max_length=160)
    horario: Optional[str] = Field(None, max_length=120)
    capacidade: int = Field(30, ge=1, le=10000)
    ativa: bool = True


class OficinaUpdate(BaseModel):
    evento_id: Optional[int] = None
    titulo: Optional[str] = Field(None, min_length=1, max_length=200)
    descricao: Optional[str] = None
    ministrante: Optional[str] = Field(None, max_length=160)
    foto_ministrante: Optional[str] = None
    remover_foto: Optional[bool] = False
    local: Optional[str] = Field(None, max_length=160)
    horario: Optional[str] = Field(None, max_length=120)
    capacidade: Optional[int] = Field(None, ge=1, le=10000)
    ativa: Optional[bool] = None


class DeleteFotoInput(BaseModel):
    url: str


class OficinaDisponibilidadeInput(BaseModel):
    ativa: bool


class OficinaConfigUpdate(BaseModel):
    aba_participante_visivel: bool


class OficinaInscreverAdminInput(BaseModel):
    usuario_id: int
