from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


class FantasiaCreate(BaseModel):
    evento_id: int
    nome_participante: Optional[str] = None  # No usuário logado, puxa automaticamente
    personagem: str = Field(..., min_length=2, max_length=150)
    universo: str = Field(..., min_length=2, max_length=150)
    descricao: Optional[str] = None
    foto_url: Optional[str] = None


class PublicInscricaoFantasia(BaseModel):
    evento_id: int
    nome_participante: str = Field(..., min_length=2, max_length=150)
    personagem: str = Field(..., min_length=2, max_length=150)
    universo: str = Field(..., min_length=2, max_length=150)
    descricao: Optional[str] = None


class FantasiaUpdate(BaseModel):
    nome_participante: Optional[str] = None
    personagem: Optional[str] = None
    universo: Optional[str] = None
    descricao: Optional[str] = None
    foto_url: Optional[str] = None
    ordem_apresentacao: Optional[int] = None


class VotoJuradoSubmit(BaseModel):
    token: str
    fantasia_id: int
    nota_impacto_visual: int = Field(..., ge=1, le=5)
    nota_performance: int = Field(..., ge=1, le=5)
    nota_dedicacao: int = Field(..., ge=1, le=5)
    observacao: Optional[str] = None


class SequenciaDesfileItem(BaseModel):
    id: int
    ordem: int


class SequenciaDesfilePayload(BaseModel):
    evento_id: int
    sequencia: List[SequenciaDesfileItem]


class AtivarPalcoPayload(BaseModel):
    evento_id: int
    fantasia_id: Optional[int] = None


class CineflixConfigUpdate(BaseModel):
    votacao_aberta: Optional[bool] = None
    nome_jurado_1: Optional[str] = None
    nome_jurado_2: Optional[str] = None
    nome_jurado_3: Optional[str] = None
    regenerar_tokens: Optional[bool] = False


class VotoJuradoResponse(BaseModel):
    numero_jurado: int
    nome_jurado: str
    nota_impacto_visual: float
    nota_performance: float
    nota_dedicacao: float
    total: float
    observacao: Optional[str] = None
    updated_at: Optional[str] = None


class FantasiaResponse(BaseModel):
    id: int
    evento_id: int
    evento_nome: Optional[str] = None
    usuario_id: Optional[int] = None
    nome_participante: str
    personagem: str
    universo: str
    descricao: Optional[str] = None
    foto_url: Optional[str] = None
    ordem_apresentacao: int = 0
    votos: List[VotoJuradoResponse] = []
    total_pontos: float = 0.0
    media_pontos: float = 0.0
    votos_recebidos: int = 0
    created_at: Optional[str] = None


class RankingItemResponse(BaseModel):
    posicao: int
    fantasia_id: int
    nome_participante: str
    personagem: str
    universo: str
    foto_url: Optional[str] = None
    nota_j1: Optional[float] = None
    nota_j2: Optional[float] = None
    nota_j3: Optional[float] = None
    pontuacao_total: float
    media_final: float
    total_avaliacoes: int
    detalhes_j1: Optional[Dict[str, Any]] = None
    detalhes_j2: Optional[Dict[str, Any]] = None
    detalhes_j3: Optional[Dict[str, Any]] = None


class CineflixConfigResponse(BaseModel):
    evento_id: int
    evento_nome: Optional[str] = None
    votacao_aberta: bool
    fantasia_ativa_id: Optional[int] = None
    fantasia_ativa: Optional[Dict[str, Any]] = None
    jurado_1: Dict[str, Any]
    jurado_2: Dict[str, Any]
    jurado_3: Dict[str, Any]
    total_fantasias: int = 0
    total_avaliadas: int = 0
