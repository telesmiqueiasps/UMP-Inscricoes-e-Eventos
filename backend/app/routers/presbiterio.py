from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.security import get_current_admin
from app.models.usuario import Usuario
from app.models.presbiterio import Presbiterio
from app.schemas.presbiterio import PresbiterioCreate, PresbiterioResponse

router = APIRouter()

# --- Public Endpoints ---
@router.get("/presbiterios", response_model=List[PresbiterioResponse], tags=["Presbitérios"])
def listar_presbiterios(db: Session = Depends(get_db)):
    return db.query(Presbiterio).order_by(Presbiterio.nome.asc()).all()

# --- Admin Endpoints ---
@router.post("/admin/presbiterios", response_model=PresbiterioResponse, status_code=status.HTTP_201_CREATED, tags=["Administração de Presbitérios"])
def criar_presbiterio_admin(
    req: PresbiterioCreate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    nome_trimmed = req.nome.strip()
    if not nome_trimmed:
        raise HTTPException(status_code=400, detail="O nome do presbitério não pode ser vazio.")
        
    existente = db.query(Presbiterio).filter(Presbiterio.nome.ilike(nome_trimmed)).first()
    if existente:
        raise HTTPException(status_code=400, detail="Já existe um presbitério cadastrado com esse nome.")
        
    db_presb = Presbiterio(nome=nome_trimmed)
    db.add(db_presb)
    db.commit()
    db.refresh(db_presb)
    return db_presb

@router.put("/admin/presbiterios/{id}", response_model=PresbiterioResponse, tags=["Administração de Presbitérios"])
def atualizar_presbiterio_admin(
    id: int,
    req: PresbiterioCreate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    nome_trimmed = req.nome.strip()
    if not nome_trimmed:
        raise HTTPException(status_code=400, detail="O nome do presbitério não pode ser vazio.")

    db_presb = db.query(Presbiterio).filter(Presbiterio.id == id).first()
    if not db_presb:
        raise HTTPException(status_code=404, detail="Presbitério não encontrado.")
        
    existente = db.query(Presbiterio).filter(Presbiterio.nome.ilike(nome_trimmed), Presbiterio.id != id).first()
    if existente:
        raise HTTPException(status_code=400, detail="Já existe outro presbitério cadastrado com esse nome.")

    db_presb.nome = nome_trimmed
    db.commit()
    db.refresh(db_presb)
    return db_presb

@router.delete("/admin/presbiterios/{id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Administração de Presbitérios"])
def deletar_presbiterio_admin(
    id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    db_presb = db.query(Presbiterio).filter(Presbiterio.id == id).first()
    if not db_presb:
        raise HTTPException(status_code=404, detail="Presbitério não encontrado.")
        
    db.delete(db_presb)
    db.commit()
    return None
