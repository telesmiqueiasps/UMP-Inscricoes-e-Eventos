import os
from typing import List, Union
from pydantic_settings import BaseSettings
from pydantic import Field, field_validator


class Settings(BaseSettings):
    PROJECT_NAME: str = "Plataforma de Inscrições e Eventos"
    API_V1_STR: str = "/api/v1"

    SECRET_KEY: str = Field(default="SUPER_SECRET_KEY_CHANGE_IN_PRODUCTION_1234567890!")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 dias

    # PostgreSQL / Supabase
    DATABASE_URL: str = Field(
        default="postgresql://postgres:postgres@localhost:5432/inscricoes_db"
    )

    # CORS
    CORS_ORIGINS: Union[str, List[str]] = [
        "http://localhost",
        "http://localhost:8000",
        "http://localhost:3000",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "*"
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], str]:
        if isinstance(v, str):
            v = v.strip('"').strip("'")
            if not v.startswith("["):
                return [i.strip() for i in v.split(",")]
        return v

    # InfinitePay Integration
    INFINITEPAY_HANDLE: str = Field(default="sua_tag_infinitepay")
    INFINITEPAY_API_URL: str = Field(default="https://api.infinitepay.io")
    INFINITEPAY_API_KEY: str = Field(default="sua_chave_api")

    # Pix Config
    PIX_CHAVE: str = Field(default="contato@evento.com.br")
    PIX_NOME_RECEBEDOR: str = Field(default="ORGANIZACAO DO EVENTO")
    PIX_CIDADE_RECEBEDOR: str = Field(default="SAO PAULO")

    # Brevo Email
    BREVO_API_KEY: str = Field(default="")
    BREVO_SENDER_EMAIL: str = "sinodalumppb@gmail.com"
    BREVO_SENDER_NAME: str = "Sinodal UMP PB"

    class Config:
        case_sensitive = True
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
