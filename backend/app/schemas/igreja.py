from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class IgrejaBase(BaseModel):
    nome: str
    presbiterio_id: int

class IgrejaCreate(IgrejaBase):
    pass

class IgrejaUpdate(BaseModel):
    nome: Optional[str] = None
    presbiterio_id: Optional[int] = None

class PresbiterioResumo(BaseModel):
    id: int
    nome: str

    class Config:
        from_attributes = True

class IgrejaResponse(IgrejaBase):
    id: int
    created_at: Optional[datetime] = None
    presbiterio: Optional[PresbiterioResumo] = None

    class Config:
        from_attributes = True
