from decimal import Decimal, ROUND_HALF_UP
from datetime import date, timedelta
import calendar
from typing import List, Dict, Any


def add_months(sourcedate: date, months: int) -> date:
    """
    Adiciona meses a uma data respeitando o fim do mês (ex: 31 de janeiro + 1 mês = 28/29 de fevereiro).
    """
    month = sourcedate.month - 1 + months
    year = sourcedate.year + month // 12
    month = month % 12 + 1
    day = min(sourcedate.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def calcular_max_parcelas(data_primeira_parcela: date, data_limite_evento: date) -> int:
    """
    Calcula dinamicamente a quantidade máxima de parcelas baseada na data da 1ª parcela e data limite do evento,
    garantindo que haja no máximo 1 parcela por mês calendário.
    """
    if not data_primeira_parcela or not data_limite_evento:
        return 1
    if data_primeira_parcela > data_limite_evento:
        return 0
    if data_primeira_parcela == data_limite_evento:
        return 1

    count = 1
    current = data_primeira_parcela
    while True:
        next_date = add_months(data_primeira_parcela, count)
        if next_date > data_limite_evento:
            # Só adicionamos a parcela final do dia do evento se ela não colidir no mesmo mês/ano com a anterior
            if current < data_limite_evento:
                if not (data_limite_evento.year == current.year and data_limite_evento.month == current.month):
                    count += 1
            break
        current = next_date
        count += 1
    return count


def gerar_parcelas(
    valor_total: float | Decimal,
    num_parcelas: int,
    data_primeira_parcela: date | None = None,
    data_limite_evento: date | None = None
) -> List[Dict[str, Any]]:
    """
    Gera as parcelas dividindo o valor_total em num_parcelas com vencimentos mensais e limite no evento.
    Garante no máximo 1 parcela por mês calendário.
    """
    if isinstance(valor_total, (float, int, str)):
        valor_total = Decimal(str(valor_total)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    
    if num_parcelas < 1:
        num_parcelas = 1

    if not data_primeira_parcela:
        data_primeira_parcela = date.today() + timedelta(days=30)

    # Citar limite máximo de parcelas permitidas
    if data_limite_evento:
        max_permitido = calcular_max_parcelas(data_primeira_parcela, data_limite_evento)
        num_parcelas = min(num_parcelas, max_permitido)

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

        # Vencimento mensal respeitando limites
        if i == 1:
            vencimento = data_primeira_parcela
        else:
            vencimento = add_months(data_primeira_parcela, i - 1)

        if data_limite_evento and vencimento > data_limite_evento:
            vencimento = data_limite_evento

        parcelas.append({
            "numero": i,
            "vencimento": vencimento,
            "valor": valor_parcela,
            "status": "PENDENTE"
        })

    return parcelas
