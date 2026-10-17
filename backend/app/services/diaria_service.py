import uuid
import logging
from decimal import Decimal
from typing import List, Tuple, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status, BackgroundTasks

from app.models.evento import Evento
from app.models.usuario import Usuario
from app.models.diaria import DiariaTriagem, InscricaoDiaria
from app.services.infinitepay import infinitepay_service
from app.services.email import enviar_email_confirmacao_diaria

logger = logging.getLogger(__name__)


def calcular_total_diarias(evento: Evento, dias_selecionados: List[str]) -> Decimal:
    """
    Calcula o valor total das diárias selecionadas baseado em evento.config_diarias.
    Suporta valor customizado por dia ou valor padrão unificado.
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

    total = Decimal("0.00")
    for dia in dias_selecionados:
        dia_str = str(dia).strip()
        valor_dia = precos_por_data.get(dia_str, valor_padrao)
        total += valor_dia

    return total


def criar_ou_atualizar_triagem_diaria(
    db: Session,
    current_user: Usuario,
    evento_id: int,
    dias_selecionados: List[str],
    dados_extras: Optional[dict] = None
) -> Tuple[DiariaTriagem, str]:
    """
    Cria ou atualiza uma DiariaTriagem e gera o link de checkout na InfinitePay.
    """
    evento = db.query(Evento).filter(Evento.id == evento_id, Evento.ativo == True).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado ou indisponível.")

    if not evento.diarias_habilitadas:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este evento não aceita inscrições por diária."
        )

    if not dias_selecionados or len(dias_selecionados) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selecione pelo menos um dia para a sua diária."
        )

    valor_total = calcular_total_diarias(evento, dias_selecionados)
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
    checkout_res = infinitepay_service.criar_checkout_link(
        order_nsu=order_nsu,
        valor=valor_total,
        descricao=f"Diaria ({len(dias_selecionados)}d) - {evento.titulo}",
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
