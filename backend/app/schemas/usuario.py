from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class UsuarioBase(BaseModel):
    nome: str
    email: EmailStr
    cpf: Optional[str] = None
    telefone: Optional[str] = None


class UsuarioCreate(UsuarioBase):
    senha: str


class UsuarioUpdate(BaseModel):
    nome: Optional[str] = None
    email: Optional[EmailStr] = None
    cpf: Optional[str] = None
    telefone: Optional[str] = None
    senha: Optional[str] = None


class UsuarioResponse(UsuarioBase):
    id: int
    is_admin: bool
    created_at: datetime

    class Config:
        from_attributes = True
