import uuid
import logging
from decimal import Decimal
from typing import List, Tuple, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status, BackgroundTasks

from app.models.evento import Evento
from app.models.usuario import Usuario
from app.models.inscricao import Inscricao
from app.models.diaria import DiariaTriagem, InscricaoDiaria
from app.services.infinitepay import infinitepay_service
from app.services.email import enviar_email_confirmacao_diaria

logger = logging.getLogger(__name__)


def calcular_total_diarias(evento: Evento, dias_selecionados: List[str], combo_id: Optional[str] = None) -> Decimal:
    """
    Calcula o valor total das diárias selecionadas baseado em evento.config_diarias.
    Suporta:
    1. Combos promocionais de múltiplos dias com valor fechado estipulado.
    2. Valor customizado por dia ou valor padrão unificado.
    """
    if not dias_selecionados:
        return Decimal("0.00")

    config = evento.config_diarias or {}
    valor_padrao = Decimal(str(config.get("valor_padrao") or evento.valor or "0.00"))

    # Mapeamento de data -> valor caso haja configuração individual
    dias_config = config.get("dias") or []
    precos_por_data = {}
    if isinstance(dias_config, list):
        for d in dias_config:
            if isinstance(d, dict) and d.get("data"):
                try:
                    precos_por_data[d["data"]] = Decimal(str(d.get("valor") or valor_padrao))
                except Exception:
                    precos_por_data[d["data"]] = valor_padrao

    combos_config = config.get("combos") or []
    dias_set = set(str(d).strip() for d in dias_selecionados)

    # 1. Se foi especificado um combo_id ou se há combos ativos configurados
    if isinstance(combos_config, list) and combos_config:
        # 1a. Caso haja combo_id explícito
        if combo_id:
            for combo in combos_config:
                if isinstance(combo, dict) and str(combo.get("id")) == str(combo_id) and combo.get("ativo", True):
                    combo_dias = set(str(d).strip() for d in (combo.get("dias") or []))
                    if combo_dias and combo_dias.issubset(dias_set):
                        valor_combo = Decimal(str(combo.get("valor") or "0.00"))
                        dias_extras = dias_set - combo_dias
                        total_extras = sum(precos_por_data.get(d, valor_padrao) for d in dias_extras)
                        return valor_combo + total_extras

        # 1b. Busca exata: se os dias selecionados batem exatamente com um combo ativo
        for combo in combos_config:
            if isinstance(combo, dict) and combo.get("ativo", True):
                combo_dias = set(str(d).strip() for d in (combo.get("dias") or []))
                if combo_dias and combo_dias == dias_set:
                    return Decimal(str(combo.get("valor") or "0.00"))

        # 1c. Busca por melhor cobertura de combo (ex: combo de 2 dias + 1 dia avulso)
        melhor_total = None
        for combo in combos_config:
            if isinstance(combo, dict) and combo.get("ativo", True):
                combo_dias = set(str(d).strip() for d in (combo.get("dias") or []))
                if combo_dias and combo_dias.issubset(dias_set):
                    valor_combo = Decimal(str(combo.get("valor") or "0.00"))
                    dias_extras = dias_set - combo_dias
                    total_extras = sum(precos_por_data.get(d, valor_padrao) for d in dias_extras)
                    candidato = valor_combo + total_extras
                    if melhor_total is None or candidato < melhor_total:
                        melhor_total = candidato

        if melhor_total is not None:
            total_avulso = sum(precos_por_data.get(str(d).strip(), valor_padrao) for d in dias_selecionados)
            return min(melhor_total, total_avulso)

    total = Decimal("0.00")
    for dia in dias_selecionados:
        dia_str = str(dia).strip()
        valor_dia = precos_por_data.get(dia_str, valor_padrao)
        total += valor_dia

    return total


def obter_dias_inscritos_usuario(db: Session, usuario_id: int, evento_id: int) -> List[str]:
    """
    Retorna a lista ordenada de dias (strings no formato YYYY-MM-DD) para os quais
    o usuário já possui uma inscrição por diária confirmada neste evento.
    """
    diarias = db.query(InscricaoDiaria).filter(
        InscricaoDiaria.usuario_id == usuario_id,
        InscricaoDiaria.evento_id == evento_id,
        InscricaoDiaria.status == "CONFIRMADA"
    ).all()

    dias_set = set()
    for d in diarias:
        lista = d.dias_selecionados
        if isinstance(lista, list):
            for item in lista:
                data_limpa = str(item).strip().split('T')[0]
                if data_limpa:
                    dias_set.add(data_limpa)
        elif isinstance(lista, str):
            data_limpa = lista.strip().split('T')[0]
            if data_limpa:
                dias_set.add(data_limpa)

    return sorted(list(dias_set))


def criar_ou_atualizar_triagem_diaria(
    db: Session,
    current_user: Usuario,
    evento_id: int,
    dias_selecionados: List[str],
    dados_extras: Optional[dict] = None
) -> Tuple[DiariaTriagem, str]:
    """
    Cria ou atualiza uma DiariaTriagem e gera o link de checkout na InfinitePay.
    Valida:
    1. Usuário não pode ter mais de uma diária no mesmo dia (rejeita se já confirmada).
    2. Usuário não pode se inscrever se já tiver inscrição integral confirmada no evento.
    3. Remove duplicatas da lista de dias da própria requisição.
    """
    evento = db.query(Evento).filter(Evento.id == evento_id, Evento.ativo == True).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado ou indisponível.")

    if not evento.diarias_habilitadas:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este evento não aceita inscrições por diária."
        )

    # 1. Normalizar e remover duplicatas dos dias solicitados
    dias_limpos = []
    if dias_selecionados:
        for d in dias_selecionados:
            d_str = str(d).strip().split('T')[0]
            if d_str and d_str not in dias_limpos:
                dias_limpos.append(d_str)

    if not dias_limpos or len(dias_limpos) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selecione pelo menos um dia para a sua diária."
        )

    # 2. Verificar se o participante já possui inscrição integral confirmada no evento
    inscricao_integral = db.query(Inscricao).filter(
        Inscricao.usuario_id == current_user.id,
        Inscricao.evento_id == evento.id,
        Inscricao.status == "CONFIRMADA"
    ).first()
    if inscricao_integral:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Você já possui uma inscrição integral confirmada para este evento. Não é necessário adquirir diárias avulsas."
        )

    # 3. REGRA ESTRITA: Participante não pode se inscrever em mais de uma diária no mesmo dia
    dias_ja_adquiridos = set(obter_dias_inscritos_usuario(db, current_user.id, evento.id))
    conflitos = [d for d in dias_limpos if d in dias_ja_adquiridos]
    if conflitos:
        conflitos_fmt = []
        for c in conflitos:
            partes = c.split('-')
            if len(partes) == 3:
                conflitos_fmt.append(f"{partes[2]}/{partes[1]}/{partes[0]}")
            else:
                conflitos_fmt.append(c)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Você já possui inscrição confirmada para a diária do(s) dia(s): {', '.join(conflitos_fmt)}. Não é permitido se inscrever em mais de uma diária no mesmo dia."
        )

    dias_selecionados = dias_limpos

    combo_id = dados_extras.get("combo_id") if isinstance(dados_extras, dict) else None
    valor_total = calcular_total_diarias(evento, dias_selecionados, combo_id=combo_id)
    if valor_total <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Valor da diária inválido. Entre em contato com a organização."
        )

    # 1. Buscar se já existe uma triagem pendente deste usuário para este evento
    triagem = db.query(DiariaTriagem).filter(
        DiariaTriagem.usuario_id == current_user.id,
        DiariaTriagem.evento_id == evento.id,
        DiariaTriagem.status == "PENDENTE_PAGAMENTO"
    ).first()

    if triagem:
        triagem.dias_selecionados = dias_selecionados
        triagem.quantidade_dias = len(dias_selecionados)
        triagem.valor_total = valor_total
        triagem.dados_extras = dados_extras
        db.commit()
        db.refresh(triagem)
    else:
        triagem = DiariaTriagem(
            usuario_id=current_user.id,
            evento_id=evento.id,
            dias_selecionados=dias_selecionados,
            quantidade_dias=len(dias_selecionados),
            valor_total=valor_total,
            status="PENDENTE_PAGAMENTO",
            forma_pagamento="INFINITEPAY",
            dados_extras=dados_extras
        )
        db.add(triagem)
        db.commit()
        db.refresh(triagem)

    # 2. Gerar link de checkout InfinitePay
    order_nsu = f"DIARIA_TRIAGEM-{triagem.id}"
    combo_nome = dados_extras.get("combo_nome") if isinstance(dados_extras, dict) else None
    desc_diaria = f"Diaria ({combo_nome}) - {evento.titulo}" if combo_nome else f"Diaria ({len(dias_selecionados)}d) - {evento.titulo}"
    checkout_res = infinitepay_service.criar_checkout_link(
        order_nsu=order_nsu,
        valor=valor_total,
        descricao=desc_diaria,
        customer_email=current_user.email,
        customer_name=current_user.nome
    )

    checkout_url = checkout_res.get("checkout_url")
    return triagem, checkout_url


def converter_triagem_em_diaria(
    db: Session,
    triagem: DiariaTriagem,
    order_nsu: str = None,
    transaction_nsu: str = None,
    receipt_url: str = None,
    invoice_slug: str = None,
    paid_amount: Decimal = Decimal("0.00"),
    capture_method: str = None,
    background_tasks: BackgroundTasks = None
) -> InscricaoDiaria:
    """
    Converte DiariaTriagem em InscricaoDiaria (CONFIRMADA).
    """
    if order_nsu:
        existente_nsu = db.query(InscricaoDiaria).filter(
            InscricaoDiaria.order_nsu == order_nsu
        ).first()
        if existente_nsu:
            triagem.status = "CONVERTIDA"
            db.commit()
            return existente_nsu

    if triagem.status == "CONVERTIDA":
        existente = db.query(InscricaoDiaria).filter(
            InscricaoDiaria.usuario_id == triagem.usuario_id,
            InscricaoDiaria.evento_id == triagem.evento_id,
            InscricaoDiaria.status != "CANCELADA"
        ).order_by(InscricaoDiaria.created_at.desc()).first()
        if existente:
            return existente

    evento = triagem.evento or db.query(Evento).filter(Evento.id == triagem.evento_id).first()
    usuario = triagem.usuario or db.query(Usuario).filter(Usuario.id == triagem.usuario_id).first()

    codigo_checkin = f"CK-D-{uuid.uuid4().hex[:10].upper()}"

    diaria = InscricaoDiaria(
        usuario_id=triagem.usuario_id,
        evento_id=triagem.evento_id,
        dias_selecionados=triagem.dias_selecionados,
        quantidade_dias=triagem.quantidade_dias,
        valor_total=triagem.valor_total,
        status="CONFIRMADA",
        forma_pagamento="INFINITEPAY",
        dados_extras=triagem.dados_extras,
        codigo_checkin=codigo_checkin,
        transaction_nsu=transaction_nsu,
        receipt_url=receipt_url,
        order_nsu=order_nsu,
        invoice_slug=invoice_slug,
        paid_amount=paid_amount,
        capture_method=capture_method
    )
    db.add(diaria)

    triagem.status = "CONVERTIDA"
    db.commit()
    db.refresh(diaria)

    # Enviar e-mail de confirmação em background
    if background_tasks and usuario and evento:
        dias_fmt = ", ".join(diaria.dias_selecionados) if isinstance(diaria.dias_selecionados, list) else str(diaria.dias_selecionados)
        background_tasks.add_task(
            enviar_email_confirmacao_diaria,
            destinatario_email=usuario.email,
            destinatario_nome=usuario.nome,
            nome_evento=evento.titulo,
            dias_formatados=dias_fmt,
            valor=float(diaria.valor_total),
            codigo_checkin=codigo_checkin
        )

    return diaria
