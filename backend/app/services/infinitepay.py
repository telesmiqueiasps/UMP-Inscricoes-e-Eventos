import httpx
from typing import Dict, Any, Optional
from decimal import Decimal
from app.core.config import settings


class InfinitePayService:
    def __init__(self):
        self.handle = settings.INFINITEPAY_HANDLE
        self.api_url = settings.INFINITEPAY_API_URL
        self.api_key = settings.INFINITEPAY_API_KEY

    def criar_checkout_link(
        self,
        order_nsu: str,
        valor: float | Decimal,
        descricao: str,
        customer_email: str,
        customer_name: str,
        redirect_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Cria um link de checkout/pagamento InfinitePay para a inscrição.
        Retorna URL de checkout e identificadores.
        """
        valor_cents = int(Decimal(str(valor)) * 100)
        valor_reais = float(valor)
        
        # Link amigável de checkout InfinitePay (usando valor em Reais na URL de pagamento)
        checkout_url = f"https://pay.infinitepay.io/{self.handle}/{valor_reais:.2f}?order_nsu={order_nsu}"

        payload = {
            "handle": self.handle,
            "order_nsu": order_nsu,
            "amount": valor_cents,
            "description": descricao,
            "customer": {
                "name": customer_name,
                "email": customer_email
            },
            "redirect_url": redirect_url or ""
        }

        try:
            # Caso a API de checkout da InfinitePay seja chamada diretamente via HTTP
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            # Tentativa de chamada HTTP externa
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(f"{self.api_url}/v2/checkouts", json=payload, headers=headers)
                if resp.status_code in [200, 201]:
                    data = resp.json()
                    return {
                        "checkout_url": data.get("checkout_url", checkout_url),
                        "order_nsu": order_nsu,
                        "invoice_slug": data.get("invoice_slug", order_nsu)
                    }
        except Exception:
            # Fallback para o formato padrão do InfinitePay Smart Link
            pass

        return {
            "checkout_url": checkout_url,
            "order_nsu": order_nsu,
            "invoice_slug": order_nsu
        }


infinitepay_service = InfinitePayService()
