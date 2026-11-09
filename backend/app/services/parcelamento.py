from decimal import Decimal, ROUND_HALF_UP
from datetime import date, datetime, timedelta, timezone
import calendar
from typing import List, Dict, Any

TZ_BRASIL = timezone(timedelta(hours=-3))


def get_hoje_brasil() -> date:
    """Retorna a data atual no fuso horário do Brasil (UTC-3)."""
    return datetime.now(TZ_BRASIL).date()


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
        data_primeira_parcela = get_hoje_brasil() + timedelta(days=30)

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


def obter_parcelas_triagem(triagem: Any, evento: Any = None) -> List[Dict[str, Any]]:
    """
    Retorna a lista de parcelas para uma triagem.
    Se a triagem possuir 'parcelas_personalizadas' configuradas em dados_extras,
    respeita exatamente os vencimentos e valores personalizados definidos.
    Caso contrário, calcula dinamicamente com base no vencimento inicial e data do evento.
    """
    if triagem.dados_extras and isinstance(triagem.dados_extras, dict):
        custom_parcs = triagem.dados_extras.get("parcelas_personalizadas")
        if custom_parcs and isinstance(custom_parcs, list) and len(custom_parcs) > 0:
            res = []
            for item in custom_parcs:
                venc = item.get("vencimento")
                if isinstance(venc, str):
                    venc = date.fromisoformat(venc)
                res.append({
                    "numero": int(item.get("numero", 1)),
                    "vencimento": venc,
                    "valor": Decimal(str(item.get("valor", "0.00"))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
                    "status": item.get("status", "PENDENTE")
                })
            return res

    dt_primeira = triagem.data_primeira_parcela or get_hoje_brasil()
    if dt_primeira < get_hoje_brasil():
        dt_primeira = get_hoje_brasil()

    dt_limite = evento.data_inicio.date() if (evento and evento.data_inicio) else dt_primeira
    max_permitido = calcular_max_parcelas(dt_primeira, dt_limite)
    n_parcelas = min(max(triagem.num_parcelas or 1, 1), max(max_permitido, 1))

    return gerar_parcelas(
        valor_total=triagem.valor_total,
        num_parcelas=n_parcelas,
        data_primeira_parcela=dt_primeira,
        data_limite_evento=dt_limite
    )
