from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_password_hash, verify_password, create_access_token, get_current_user
from app.models.usuario import Usuario
from app.schemas.auth import Token, LoginRequest
from app.schemas.usuario import UsuarioCreate, UsuarioResponse

router = APIRouter(prefix="/auth", tags=["Autenticação"])


@router.get("/check-email")
def check_email(email: str, db: Session = Depends(get_db)):
    user = db.query(Usuario).filter(Usuario.email == email).first()
    return {"exists": user is not None}


@router.post("/register", response_model=UsuarioResponse, status_code=status.HTTP_201_CREATED)
def register(user_in: UsuarioCreate, db: Session = Depends(get_db)):
    # Verificar email único
    user_exist = db.query(Usuario).filter(Usuario.email == user_in.email).first()
    if user_exist:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este e-mail já está cadastrado."
        )
    
    # Verificar CPF único se fornecido
    if user_in.cpf:
        cpf_exist = db.query(Usuario).filter(Usuario.cpf == user_in.cpf).first()
        if cpf_exist:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Este CPF já está cadastrado."
            )

    hashed_pw = get_password_hash(user_in.senha)
    
    # Se for o primeiro usuário do banco, torna admin automaticamente
    total_users = db.query(Usuario).count()
    is_admin = (total_users == 0)

    db_user = Usuario(
        nome=user_in.nome,
        email=user_in.email,
        senha_hash=hashed_pw,
        cpf=user_in.cpf,
        telefone=user_in.telefone,
        is_admin=is_admin
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@router.post("/login", response_model=Token)
def login(login_data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(Usuario).filter(Usuario.email == login_data.email).first()
    if not user or not verify_password(login_data.senha, user.senha_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha incorretos."
        )

    access_token = create_access_token(subject=user.id)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "nome": user.nome,
            "email": user.email,
            "is_admin": user.is_admin
        }
    }


@router.post("/token", response_model=Token)
def login_form(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(Usuario).filter(Usuario.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.senha_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha incorretos."
        )

    access_token = create_access_token(subject=user.id)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "nome": user.nome,
            "email": user.email,
            "is_admin": user.is_admin
        }
    }


@router.get("/me", response_model=UsuarioResponse)
def get_me(current_user: Usuario = Depends(get_current_user)):
    return current_user
