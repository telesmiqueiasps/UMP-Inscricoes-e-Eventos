from sqlalchemy import Column, Integer, String, Numeric, DateTime, Date, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class Parcela(Base):
    __tablename__ = "parcelas"

    id = Column(Integer, primary_key=True, index=True)
    pagamento_id = Column(Integer, ForeignKey("pagamentos.id"), nullable=False)
    numero = Column(Integer, nullable=False)
    vencimento = Column(Date, nullable=False)
    valor = Column(Numeric(10, 2), nullable=False)
    qr_code_pix = Column(Text, nullable=True)
    copia_cola_pix = Column(Text, nullable=True)
    status = Column(String(50), default="PENDENTE", nullable=False)  # PENDENTE, PAGO, CANCELADO
    alerta_previo_enviado = Column(Boolean, default=False, nullable=False)
    alerta_atraso_enviado = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    pagamento = relationship("Pagamento", back_populates="parcelas")
