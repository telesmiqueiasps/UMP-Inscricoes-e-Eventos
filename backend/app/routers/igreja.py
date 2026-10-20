from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional

from app.core.database import get_db
from app.core.security import get_current_admin
from app.models.usuario import Usuario
from app.models.presbiterio import Presbiterio
from app.models.igreja import Igreja
from app.schemas.igreja import IgrejaCreate, IgrejaUpdate, IgrejaResponse

router = APIRouter()

# --- Public Endpoints ---
@router.get("/igrejas", response_model=List[IgrejaResponse], tags=["Igrejas"])
def listar_igrejas(
    presbiterio_id: Optional[int] = Query(None, description="Filtrar por ID do Presbitério"),
    db: Session = Depends(get_db)
):
    query = db.query(Igreja).options(joinedload(Igreja.presbiterio))
    if presbiterio_id is not None:
        query = query.filter(Igreja.presbiterio_id == presbiterio_id)
    return query.order_by(Igreja.nome.asc()).all()


@router.get("/presbiterios/{presbiterio_id}/igrejas", response_model=List[IgrejaResponse], tags=["Igrejas"])
def listar_igrejas_por_presbiterio(
    presbiterio_id: int,
    db: Session = Depends(get_db)
):
    presb = db.query(Presbiterio).filter(Presbiterio.id == presbiterio_id).first()
    if not presb:
        raise HTTPException(status_code=404, detail="Presbitério não encontrado.")
    return db.query(Igreja).filter(Igreja.presbiterio_id == presbiterio_id).order_by(Igreja.nome.asc()).all()


# --- Admin Endpoints ---
@router.post("/admin/igrejas", response_model=IgrejaResponse, status_code=status.HTTP_201_CREATED, tags=["Administração de Igrejas"])
def criar_igreja_admin(
    req: IgrejaCreate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    nome_trimmed = req.nome.strip()
    if not nome_trimmed:
        raise HTTPException(status_code=400, detail="O nome da igreja não pode ser vazio.")
        
    presb = db.query(Presbiterio).filter(Presbiterio.id == req.presbiterio_id).first()
    if not presb:
        raise HTTPException(status_code=404, detail="Presbitério informado não existe.")

    existente = db.query(Igreja).filter(
        Igreja.nome.ilike(nome_trimmed),
        Igreja.presbiterio_id == req.presbiterio_id
    ).first()
    if existente:
        raise HTTPException(status_code=400, detail="Esta igreja já está cadastrada para este presbitério.")

    db_igreja = Igreja(nome=nome_trimmed, presbiterio_id=req.presbiterio_id)
    db.add(db_igreja)
    db.commit()
    db.refresh(db_igreja)
    return db_igreja


@router.put("/admin/igrejas/{id}", response_model=IgrejaResponse, tags=["Administração de Igrejas"])
def atualizar_igreja_admin(
    id: int,
    req: IgrejaUpdate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    db_igreja = db.query(Igreja).filter(Igreja.id == id).first()
    if not db_igreja:
        raise HTTPException(status_code=404, detail="Igreja não encontrada.")

    novo_nome = req.nome.strip() if req.nome is not None else db_igreja.nome
    novo_presb_id = req.presbiterio_id if req.presbiterio_id is not None else db_igreja.presbiterio_id

    if not novo_nome:
        raise HTTPException(status_code=400, detail="O nome da igreja não pode ser vazio.")

    presb = db.query(Presbiterio).filter(Presbiterio.id == novo_presb_id).first()
    if not presb:
        raise HTTPException(status_code=404, detail="Presbitério informado não existe.")

    existente = db.query(Igreja).filter(
        Igreja.nome.ilike(novo_nome),
        Igreja.presbiterio_id == novo_presb_id,
        Igreja.id != id
    ).first()
    if existente:
        raise HTTPException(status_code=400, detail="Já existe outra igreja cadastrada com este nome no mesmo presbitério.")

    db_igreja.nome = novo_nome
    db_igreja.presbiterio_id = novo_presb_id
    db.commit()
    db.refresh(db_igreja)
    return db_igreja


@router.delete("/admin/igrejas/{id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Administração de Igrejas"])
def deletar_igreja_admin(
    id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin)
):
    db_igreja = db.query(Igreja).filter(Igreja.id == id).first()
    if not db_igreja:
        raise HTTPException(status_code=404, detail="Igreja não encontrada.")

    db.delete(db_igreja)
    db.commit()
    return None
