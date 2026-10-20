from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from app.core.database import Base

class Presbiterio(Base):
    __tablename__ = "presbiterios"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(150), nullable=False, unique=True)

    igrejas = relationship("Igreja", back_populates="presbiterio", cascade="all, delete-orphan", order_by="Igreja.nome")
