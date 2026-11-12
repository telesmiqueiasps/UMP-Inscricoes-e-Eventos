from pydantic import BaseModel
from typing import Optional, List


class AcomodacaoCreate(BaseModel):
    nome: str
    tipo: str = "Quarto"
    capacidade: int = 10
    genero_restrito: Optional[str] = None
    descricao: Optional[str] = None


class AcomodacaoUpdate(BaseModel):
    nome: Optional[str] = None
    tipo: Optional[str] = None
    capacidade: Optional[int] = None
    genero_restrito: Optional[str] = None
    descricao: Optional[str] = None


class AcomodacaoAlocarRequest(BaseModel):
    inscricao_ids: List[int] = []
    diaria_ids: List[int] = []


class AcomodacaoDesalocarRequest(BaseModel):
    tipo: str = "REGULAR"  # REGULAR ou DIARIA
    registro_id: int

