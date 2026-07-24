from sqlalchemy import Column, Integer, String
from app.core.database import Base

class Presbiterio(Base):
    __tablename__ = "presbiterios"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(150), nullable=False, unique=True)
