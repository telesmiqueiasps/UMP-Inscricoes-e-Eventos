import bcrypt
from datetime import datetime, timedelta
from typing import Optional, Union, Any
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        password_bytes = plain_password.encode('utf-8')[:72]
        hashed_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(password_bytes, hashed_bytes)
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    password_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password_bytes, salt).decode('utf-8')


def create_access_token(subject: Union[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(oauth2_scheme)
):
    from app.models.usuario import Usuario

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não foi possível validar as credenciais",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(Usuario).filter(Usuario.id == int(user_id)).first()
    if user is None:
        raise credentials_exception
    return user


def get_current_admin(
    current_user = Depends(get_current_user)
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado. Requer privilégios de administrador."
        )
    return current_user


def tem_permissao_admin(usuario, modulo: str) -> bool:
    """
    Verifica se o usuário é administrador e possui acesso ao módulo especificado.
    - Se perfil_acesso for 'global', tem acesso a todas as abas.
    - Se perfil_acesso contiver o nome do módulo (ex: 'gincana'), tem acesso.
    """
    if not usuario or not getattr(usuario, "is_admin", False):
        return False
    perfil = str(getattr(usuario, "perfil_acesso", "global") or "global").lower().strip()
    if perfil == "global":
        return True
    permissoes = [p.strip() for p in perfil.split(",") if p.strip()]
    return modulo.lower() in permissoes or "global" in permissoes


def require_permissao(modulo: str):
    """
    Dependency do FastAPI que exige permissão em um módulo específico.
    Administradores com perfil 'global' têm acesso irrestrito.
    """
    def dependency(current_user = Depends(get_current_admin)):
        if not tem_permissao_admin(current_user, modulo):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Acesso negado. Seu perfil de administrador não possui permissão para o módulo '{modulo}'."
            )
        return current_user
    return dependency


def require_admin_global(current_user = Depends(get_current_admin)):
    """
    Dependency que restringe a rota exclusivamente a administradores com perfil 'global'.
    """
    if not tem_permissao_admin(current_user, "global"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado. Esta operação exige privilégios de Administrador Global."
        )
    return current_user
