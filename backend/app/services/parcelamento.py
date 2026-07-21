from decimal import Decimal, ROUND_HALF_UP
from datetime import date, timedelta
from typing import List, Dict, Any


def gerar_parcelas(
    valor_total: float | Decimal,
    num_parcelas: int,
    data_inicio: date | None = None
) -> List[Dict[str, Any]]:
    """
    Gera as parcelas dividindo o valor_total em num_parcelas com vencimentos mensais.
    Eventuais diferenças de centavos na divisão são ajustadas na última parcela.
    """
    if isinstance(valor_total, (float, int, str)):
        valor_total = Decimal(str(valor_total)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    
    if num_parcelas < 1:
        num_parcelas = 1

    if not data_inicio:
        data_inicio = date.today() + timedelta(days=30)

    # Valor base truncado/arredondado em 2 casas
    valor_base = (valor_total / Decimal(num_parcelas)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    
    parcelas = []
    soma_acumulada = Decimal("0.00")

    for i in range(1, num_parcelas + 1):
        if i == num_parcelas:
            # Ajuste de centavos na última parcela
            valor_parcela = valor_total - soma_acumulada
        else:
            valor_parcela = valor_base
            soma_acumulada += valor_parcela

        # Vencimento mensal (aproximadamente 30 dias por parcela)
        vencimento = data_inicio if i == 1 else data_inicio + timedelta(days=30 * (i - 1))

        parcelas.append({
            "numero": i,
            "vencimento": vencimento,
            "valor": valor_parcela,
            "status": "PENDENTE"
        })

    return parcelas
