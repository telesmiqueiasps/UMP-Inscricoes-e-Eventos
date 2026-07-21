import httpx
import logging
import uuid
import re
from typing import Optional, Dict, Any
from app.core.config import settings

logger = logging.getLogger(__name__)


class MercadoPagoService:
    @property
    def headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {settings.MERCADO_PAGO_ACCESS_TOKEN}",
            "Content-Type": "application/json"
        }

    def criar_pagamento_pix(
        self,
        valor: float,
        descricao: str,
        email_pagador: str,
        nome_pagador: str,
        cpf_pagador: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Cria uma transação de pagamento Pix na API do Mercado Pago.
        Retorna um dicionário com:
        - id_transacao (ID do pagamento no Mercado Pago)
        - copia_cola (Pix Copia e Cola)
        - qr_code_base64 (Imagem em Base64 do QR Code)
        """
        url = "https://api.mercadopago.com/v1/payments"
        
        # Limpar CPF para conter apenas dígitos
        cpf_limpo = re.sub(r"\D", "", cpf_pagador or "")
        if not cpf_limpo or len(cpf_limpo) != 11:
            cpf_limpo = "00000000000"  # Fallback genérico se inválido/ausente

        # Separar nome e sobrenome
        partes_nome = nome_pagador.strip().split(" ")
        first_name = partes_nome[0]
        last_name = " ".join(partes_nome[1:]) if len(partes_nome) > 1 else "Silva"

        payload = {
            "transaction_amount": float(valor),
            "description": descricao[:150],  # Limite da API
            "payment_method_id": "pix",
            "payer": {
                "email": email_pagador,
                "first_name": first_name,
                "last_name": last_name,
                "identification": {
                    "type": "CPF",
                    "number": cpf_limpo
                }
            },
            "notification_url": "https://ump-inscricoes-e-eventos.onrender.com/api/v1/webhook/mercadopago"
        }

        idempotency_key = str(uuid.uuid4())
        custom_headers = self.headers.copy()
        custom_headers["X-Idempotency-Key"] = idempotency_key

        try:
            with httpx.Client(timeout=15.0) as client:
                logger.info(f"Enviando requisicao de criacao de pagamento Pix ao Mercado Pago de valor R$ {valor}")
                response = client.post(url, json=payload, headers=custom_headers)
                
                if response.status_code not in [200, 201]:
                    logger.error(f"Erro da API do Mercado Pago ({response.status_code}): {response.text}")
                    return None

                data = response.json()
                
                # Extrair dados de Pix do Mercado Pago
                id_transacao = data.get("id")
                point_of_interaction = data.get("point_of_interaction", {})
                transaction_data = point_of_interaction.get("transaction_data", {})
                
                copia_cola = transaction_data.get("qr_code")
                qr_code_base64 = transaction_data.get("qr_code_base64")

                if not copia_cola:
                    logger.error(f"Mercado Pago não retornou Pix Copia e Cola. Resposta: {data}")
                    return None

                # Garantir prefixo base64 completo para tag img
                if qr_code_base64 and not qr_code_base64.startswith("data:image"):
                    qr_code_base64 = f"data:image/png;base64,{qr_code_base64}"

                return {
                    "id_transacao": str(id_transacao),
                    "copia_cola": copia_cola,
                    "qr_code_base64": qr_code_base64
                }

        except Exception as e:
            logger.error(f"Exceção ao criar pagamento Pix no Mercado Pago: {e}")
            return None

    def obter_pagamento(self, payment_id: str) -> Optional[Dict[str, Any]]:
        """
        Consulta os detalhes de um pagamento na API do Mercado Pago.
        """
        url = f"https://api.mercadopago.com/v1/payments/{payment_id}"

        try:
            with httpx.Client(timeout=10.0) as client:
                response = client.get(url, headers=self.headers)
                if response.status_code != 200:
                    logger.error(f"Erro ao consultar pagamento MP {payment_id} ({response.status_code}): {response.text}")
                    return None
                return response.json()
        except Exception as e:
            logger.error(f"Exceção ao consultar pagamento Mercado Pago {payment_id}: {e}")
            return None


mercadopago_service = MercadoPagoService()
