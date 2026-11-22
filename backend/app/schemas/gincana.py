from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime


class GincanaEquipeUpdate(BaseModel):
    nome_equipe_1: str = Field(..., min_length=1, max_length=100)
    cor_equipe_1: str = Field(..., min_length=2, max_length=30)
    nome_equipe_2: str = Field(..., min_length=1, max_length=100)
    cor_equipe_2: str = Field(..., min_length=2, max_length=30)
    titulo: Optional[str] = "Gincana UMP"
    evento_id: Optional[int] = None


class GincanaVisibilidadeUpdate(BaseModel):
    placar_oculto: bool


class GincanaPontoCreate(BaseModel):
    equipe: int = Field(..., ge=1, le=2)
    titulo: str = Field(..., min_length=1, max_length=200)
    descricao: Optional[str] = None
    pontos: int


class GincanaPontoResponse(BaseModel):
    id: int
    equipe: int
    equipe_nome: str
    equipe_cor: str
    titulo: str
    descricao: Optional[str] = None
    pontos: int
    usuario_nome: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class EquipeInfo(BaseModel):
    numero: int
    nome: str
    cor: str
    pontos: int
    total_quartos: Optional[int] = 0
    total_vagas_quartos: Optional[int] = 0
    total_ocupantes_quartos: Optional[int] = 0
    quartos_nomes: Optional[List[str]] = []


class GincanaDetalhesResponse(BaseModel):
    id: int
    titulo: str
    evento_id: Optional[int] = None
    evento_titulo: Optional[str] = None
    placar_oculto: bool = False
    equipe_1: EquipeInfo
    equipe_2: EquipeInfo
    lider: Any  # 1, 2, "empate" ou "misterio"
    diferenca_pontos: int
    total_geral: int
    porcentagem_eq1: float
    porcentagem_eq2: float
    historico: List[GincanaPontoResponse]
    atualizado_em: datetime

    class Config:
        from_attributes = True
