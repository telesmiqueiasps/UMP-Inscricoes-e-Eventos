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


class AcomodacaoDefinirLiderRequest(BaseModel):
    registro_id: Optional[int] = None  # None ou 0 para remover o líder
    tipo: Optional[str] = "REGULAR"    # REGULAR ou DIARIA


