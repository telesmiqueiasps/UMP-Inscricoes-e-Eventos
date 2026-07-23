from app.core.database import SessionLocal
from app.core.config import settings
from app.models.configuracao import Configuracao


def get_config(chave: str, default: str = None) -> str:
    db = SessionLocal()
    try:
        cfg = db.query(Configuracao).filter(Configuracao.chave == chave).first()
        if cfg and cfg.valor is not None and cfg.valor.strip() != "":
            return cfg.valor
        return default
    except Exception:
        return default
    finally:
        db.close()


def get_infinitepay_handle() -> str:
    return get_config("infinitepay_handle", settings.INFINITEPAY_HANDLE)


def get_pix_chave() -> str:
    return get_config("pix_chave", settings.PIX_CHAVE)


def get_pix_nome_recebedor() -> str:
    return get_config("pix_nome_recebedor", settings.PIX_NOME_RECEBEDOR)


def get_pix_cidade_recebedor() -> str:
    return get_config("pix_cidade_recebedor", settings.PIX_CIDADE_RECEBEDOR)
