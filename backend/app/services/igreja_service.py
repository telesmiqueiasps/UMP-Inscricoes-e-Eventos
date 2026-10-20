from typing import Optional, Dict, Any
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.models.igreja import Igreja

def validar_igreja_dados_extras(db: Session, dados_extras: Optional[Dict[str, Any]]) -> None:
    """
    Valida se a igreja informada em dados_extras está devidamente cadastrada na tabela de igrejas.
    Impede que valores arbitrários sejam inseridos fora da lista de igrejas ou 'Outra'.
    """
    if not dados_extras or not isinstance(dados_extras, dict):
        return

    nome_igreja = dados_extras.get("igreja")
    if not nome_igreja or not str(nome_igreja).strip():
        return

    nome_limpo = str(nome_igreja).strip()
    igreja = db.query(Igreja).filter(Igreja.nome.ilike(nome_limpo)).first()
    if not igreja:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A igreja '{nome_limpo}' não foi encontrada na lista oficial. Por favor, escolha uma igreja válida ou selecione 'Outra'."
        )
