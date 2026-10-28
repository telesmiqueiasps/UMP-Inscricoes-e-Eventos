import time
from typing import Optional, Dict, Tuple
from app.core.database import SessionLocal
from app.core.config import settings
from app.models.configuracao import Configuracao

_cache: Dict[str, Tuple[Optional[str], float]] = {}
CACHE_TTL_SECONDS = 60.0  # 60 segundos de cache para evitar sobrecarga de consultas


def get_config(chave: str, default: str = None) -> str:
    now = time.time()
    if chave in _cache:
        val, expiry = _cache[chave]
        if now < expiry:
            return val if val is not None else default

    db = SessionLocal()
    try:
        cfg = db.query(Configuracao).filter(Configuracao.chave == chave).first()
        val = cfg.valor if (cfg and cfg.valor is not None and cfg.valor.strip() != "") else None
        _cache[chave] = (val, now + CACHE_TTL_SECONDS)
        return val if val is not None else default
    except Exception:
        return default
    finally:
        db.close()


def clear_config_cache():
    """Limpa o cache em memória para forçar atualização imediata."""
    _cache.clear()


def get_infinitepay_handle() -> str:
    return get_config("infinitepay_handle", settings.INFINITEPAY_HANDLE)


def get_pix_chave() -> str:
    return get_config("pix_chave", settings.PIX_CHAVE)


def get_pix_nome_recebedor() -> str:
    return get_config("pix_nome_recebedor", settings.PIX_NOME_RECEBEDOR)


def get_pix_cidade_recebedor() -> str:
    return get_config("pix_cidade_recebedor", settings.PIX_CIDADE_RECEBEDOR)
