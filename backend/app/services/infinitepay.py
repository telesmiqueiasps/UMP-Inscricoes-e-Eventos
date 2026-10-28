import httpx
import logging
from typing import Dict, Any, Optional
from decimal import Decimal
from app.core.config import settings

logger = logging.getLogger(__name__)


class InfinitePayService:
    def __init__(self):
        self.api_url = settings.INFINITEPAY_API_URL
        self.api_key = settings.INFINITEPAY_API_KEY
        self._client: Optional[httpx.Client] = None

    def _get_client(self) -> httpx.Client:
        if self._client is None or self._client.is_closed:
            self._client = httpx.Client(
                timeout=10.0,
                limits=httpx.Limits(max_keepalive_connections=10, max_connections=20, keepalive_expiry=30.0)
            )
        return self._client

    def close(self):
        """Fecha a sessão HTTP persistente liberando recursos e sockets."""
        if self._client is not None:
            try:
                if not self._client.is_closed:
                    self._client.close()
            except Exception:
                pass
            finally:
                self._client = None

    @property
    def handle(self) -> str:
        from app.services.config import get_infinitepay_handle
        return get_infinitepay_handle()

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

        final_redirect_url = redirect_url or "https://inscricoessinodalpb.netlify.app/confirmacao.html"
        
        webhook_endpoint = "https://ump-inscricoes-e-eventos.onrender.com/api/v1/webhook/infinitepay"
        payload = {
            "handle": self.handle,
            "order_nsu": order_nsu,
            "redirect_url": final_redirect_url,
            "webhook_url": webhook_endpoint,
            "webhook": {
                "url": webhook_endpoint,
                "events": ["paid", "canceled", "refunded"]
            },
            "items": [
                {
                    "description": descricao,
                    "price": valor_cents,
                    "quantity": 1
                }
            ]
        }

        try:
            headers = {
                "Content-Type": "application/json"
            }
            client = self._get_client()
            resp = client.post("https://api.checkout.infinitepay.io/links", json=payload, headers=headers)
            if resp.status_code in [200, 201]:
                data = resp.json()
                return {
                    "checkout_url": data.get("url") or data.get("checkout_url") or checkout_url,
                    "order_nsu": order_nsu,
                    "invoice_slug": data.get("invoice_slug") or data.get("slug") or order_nsu
                }
        except Exception as e:
            if isinstance(e, (httpx.TransportError, httpx.NetworkError)):
                self.close()

        # Formatar valor em reais com vírgula para o link amigável estático
        valor_str = f"{valor_reais:.2f}".replace(".", ",")
        checkout_url_fallback = f"https://pay.infinitepay.io/{self.handle}/{valor_str}?order_nsu={order_nsu}"

        return {
            "checkout_url": checkout_url_fallback,
            "order_nsu": order_nsu,
            "invoice_slug": order_nsu
        }

    def consultar_status_pagamento(
        self,
        order_nsu: str,
        transaction_nsu: Optional[str] = None,
        slug: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Consulta o status do pagamento na InfinitePay usando o endpoint de payment_check.
        """
        payload = {
            "handle": self.handle,
            "order_nsu": order_nsu,
            "transaction_nsu": transaction_nsu or "",
            "slug": slug or ""
        }
        try:
            headers = {
                "Content-Type": "application/json"
            }
            client = self._get_client()
            resp = client.post("https://api.checkout.infinitepay.io/payment_check", json=payload, headers=headers)
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            if isinstance(e, (httpx.TransportError, httpx.NetworkError)):
                self.close()
        return {}


infinitepay_service = InfinitePayService()
