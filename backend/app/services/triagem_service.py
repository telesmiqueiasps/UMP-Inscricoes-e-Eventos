import uuid
import logging
from decimal import Decimal
from datetime import datetime, date
from sqlalchemy.orm import Session
from fastapi import HTTPException, status, BackgroundTasks

from app.models.inscricao import Inscricao
from app.models.inscricao_triagem import InscricaoTriagem
from app.models.evento import Evento
from app.models.pagamento import Pagamento
from app.models.parcela import Parcela
from app.services.parcelamento import gerar_parcelas, calcular_max_parcelas, get_hoje_brasil
from app.services.email import enviar_email_confirmacao

logger = logging.getLogger(__name__)


def converter_triagem_em_inscricao(
    db: Session,
    triagem: InscricaoTriagem,
    order_nsu: str = None,
    transaction_nsu: str = None,
    receipt_url: str = None,
    invoice_slug: str = None,
    paid_amount: Decimal = Decimal("0.00"),
    capture_method: str = None,
    parcela_num_paga: int = 1,
    background_tasks: BackgroundTasks = None
) -> Inscricao:
    """
    Converte um registro de InscricaoTriagem para a tabela oficial Inscricao (CONFIRMADA).
    Cria o Pagamento correspondente e as Parcelas.
    Dispara o e-mail de confirmação de inscrição.
    """
    if triagem.status == "CONVERTIDA":
        # Já convertida anteriormente, buscar inscrição existente
        inscricao_existente = db.query(Inscricao).filter(
            Inscricao.usuario_id == triagem.usuario_id,
            Inscricao.evento_id == triagem.evento_id,
            Inscricao.status != "CANCELADA"
        ).order_by(Inscricao.created_at.desc()).first()
        if inscricao_existente:
            # Se for uma parcela subsequente sendo paga, dar baixa na parcela correspondente
            if parcela_num_paga:
                for pag_ex in inscricao_existente.pagamentos:
                    for p_ex in pag_ex.parcelas:
                        if p_ex.numero == parcela_num_paga:
                            p_ex.status = "PAGO"
                            if paid_amount:
                                pag_ex.paid_amount = (pag_ex.paid_amount or Decimal("0.00")) + paid_amount
                            if capture_method:
                                pag_ex.capture_method = capture_method
                            db.commit()
                            if all(p.status == "PAGO" for p in pag_ex.parcelas):
                                pag_ex.status = "PAGO"
                                inscricao_existente.status = "CONFIRMADA"
                                db.commit()
                            logger.warning(f"Parcela #{parcela_num_paga} da Inscrição existente ID={inscricao_existente.id} baixada com sucesso!")
            return inscricao_existente

    evento = triagem.evento or db.query(Evento).filter(Evento.id == triagem.evento_id).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado para esta triagem.")

    # 1. Verificar se há vaga disponível no evento
    if evento.max_participantes:
        total_inscritos = db.query(Inscricao).filter(
            Inscricao.evento_id == evento.id,
            Inscricao.status != "CANCELADA"
        ).count()

        if total_inscritos >= evento.max_participantes:
            logger.error(f"Inscrição não pôde ser convertida: vagas esgotadas para evento #{evento.id}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Infelizmente as vagas para este evento foram esgotadas."
            )

    is_parcelado = (triagem.forma_pagamento == "PARCELADO" and triagem.num_parcelas > 1)
    status_inscricao_inicial = "PENDENTE" if is_parcelado else "CONFIRMADA"

    # 2. Criar Inscrição Oficial (Vai para a tabela oficial de inscrições)
    db_inscricao = Inscricao(
        usuario_id=triagem.usuario_id,
        evento_id=triagem.evento_id,
        status=status_inscricao_inicial,
        forma_pagamento=triagem.forma_pagamento,
        valor_total=triagem.valor_total,
        dados_extras=triagem.dados_extras,
        codigo_checkin=f"CK-{uuid.uuid4().hex[:12].upper()}"
    )
    db.add(db_inscricao)
    db.commit()
    db.refresh(db_inscricao)

    # 3. Determinar status do pagamento global
    is_parcelado = (triagem.forma_pagamento == "PARCELADO" and triagem.num_parcelas > 1)
    status_pagamento_global = "PENDENTE" if is_parcelado else "PAGO"

    db_pagamento = Pagamento(
        inscricao_id=db_inscricao.id,
        forma_pagamento=triagem.forma_pagamento or "PIX",
        valor=triagem.valor_total,
        status=status_pagamento_global,
        transaction_nsu=transaction_nsu,
        receipt_url=receipt_url,
        order_nsu=order_nsu,
        invoice_slug=invoice_slug,
        paid_amount=paid_amount,
        capture_method=capture_method
    )
    db.add(db_pagamento)
    db.commit()
    db.refresh(db_pagamento)

    # 4. Criar Parcelas com link e QR Code gerados
    from app.services.infinitepay import infinitepay_service
    from app.services.pix import gerar_qr_code_base64

    if is_parcelado:
        dt_primeira = triagem.data_primeira_parcela or get_hoje_brasil()
        dt_limite = evento.data_inicio.date() if evento.data_inicio else dt_primeira
        
        max_parc = calcular_max_parcelas(dt_primeira, dt_limite)
        n_parc = min(max(triagem.num_parcelas or 1, 1), max(max_parc, 1))

        parcelas_calc = gerar_parcelas(
            valor_total=triagem.valor_total,
            num_parcelas=n_parc,
            data_primeira_parcela=dt_primeira,
            data_limite_evento=dt_limite
        )

        for p_item in parcelas_calc:
            num = p_item["numero"]
            st_parc = "PAGO" if num == parcela_num_paga else "PENDENTE"
            order_nsu_parc = f"ORD-{db_inscricao.id}-PARC-{num}"
            link_parc = None
            qr_b64 = None

            if st_parc != "PAGO":
                try:
                    res_chk = infinitepay_service.criar_checkout_link(
                        order_nsu=order_nsu_parc,
                        valor=p_item["valor"],
                        descricao=f"Inscrição #{db_inscricao.id} ({evento.titulo}) - Parcela {num}/{n_parc}",
                        customer_email=triagem.usuario.email if triagem.usuario else "",
                        customer_name=triagem.usuario.nome if triagem.usuario else ""
                    )
                    link_parc = res_chk.get("checkout_url")
                except Exception:
                    val_fmt = f"{float(p_item['valor']):.2f}".replace(".", ",")
                    link_parc = f"https://pay.infinitepay.io/{infinitepay_service.handle}/{val_fmt}?order_nsu={order_nsu_parc}"
                qr_b64 = gerar_qr_code_base64(link_parc)
            else:
                link_parc = receipt_url or f"https://pay.infinitepay.io/{infinitepay_service.handle}"

            parc = Parcela(
                pagamento_id=db_pagamento.id,
                numero=num,
                vencimento=p_item["vencimento"],
                valor=p_item["valor"],
                copia_cola_pix=link_parc,
                qr_code_pix=qr_b64,
                status=st_parc
            )
            db.add(parc)
    else:
        # 1 Parcela única (Pix ou InfinitePay cartão)
        parc = Parcela(
            pagamento_id=db_pagamento.id,
            numero=1,
            vencimento=get_hoje_brasil(),
            valor=triagem.valor_total,
            copia_cola_pix=receipt_url,
            status="PAGO"
        )
        db.add(parc)

    # 5. Marcar triagem como CONVERTIDA
    triagem.status = "CONVERTIDA"
    db.commit()

    # 6. Agendar e-mail de confirmação
    if background_tasks and triagem.usuario:
        background_tasks.add_task(
            enviar_email_confirmacao,
            destinatario_email=triagem.usuario.email,
            destinatario_nome=triagem.usuario.nome,
            nome_evento=evento.titulo
        )

    logger.warning(f"Triagem ID={triagem.id} convertida com SUCESSO para Inscrição ID={db_inscricao.id} (Usuário {triagem.usuario_id}).")
    return db_inscricao
