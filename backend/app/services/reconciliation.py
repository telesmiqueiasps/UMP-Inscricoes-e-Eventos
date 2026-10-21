import asyncio
import logging
from datetime import datetime, timedelta, date
from decimal import Decimal
from app.core.database import SessionLocal
from app.models.pagamento import Pagamento
from app.models.inscricao import Inscricao
from app.models.parcela import Parcela
from app.models.inscricao_triagem import InscricaoTriagem
from app.models.diaria import DiariaTriagem
from app.services.infinitepay import infinitepay_service
from app.services.email import enviar_email_confirmacao, enviar_email_alerta_vencimento
from app.services.pix import gerar_qr_code_base64
from app.services.triagem_service import converter_triagem_em_inscricao
from app.services.diaria_service import converter_triagem_em_diaria
from app.services.parcelamento import get_hoje_brasil

logger = logging.getLogger(__name__)


async def reconciliar_pagamentos_pendentes():
    """
    Job de reconciliação de pagamentos InfinitePay:
    1. Reconcilia pagamentos à vista (PIX/INFINITEPAY).
    2. Reconcilia todas as parcelas pendentes de carnês em múltiplos formatos de NSU.
    3. Reconcilia triagens pendentes (regular e diárias).
    4. Garante geração e persistência de links de pagamento para parcelas pendentes.
    5. Processa lembretes de vencimento com links diretos.
    """
    logger.warning("Iniciando job de reconciliação de pagamentos InfinitePay...")
    db = SessionLocal()
    try:
        # --- 1. RECONCILIAR PAGAMENTOS À VISTA (PIX/INFINITEPAY) ---
        pagamentos = db.query(Pagamento).join(Inscricao).filter(
            Pagamento.status == "PENDENTE",
            Pagamento.forma_pagamento.in_(["INFINITEPAY", "PIX"]),
            Inscricao.status != "CANCELADA"
        ).all()
        
        logger.warning(f"Reconciliação: Encontrados {len(pagamentos)} pagamentos à vista pendentes para verificar.")
        
        for pagamento in pagamentos:
            if pagamento.order_nsu:
                try:
                    res = infinitepay_service.consultar_status_pagamento(
                        order_nsu=pagamento.order_nsu,
                        transaction_nsu=pagamento.transaction_nsu,
                        slug=pagamento.invoice_slug
                    )
                    
                    if res.get("paid") is True:
                        logger.warning(f"Reconciliação: Pagamento ID={pagamento.id} consta como PAGO no payment_check!")
                        
                        pagamento.status = "PAGO"
                        if res.get("paid_amount"):
                            pagamento.paid_amount = Decimal(str(res.get("paid_amount"))) / 100
                        if res.get("capture_method"):
                            pagamento.capture_method = str(res.get("capture_method"))
                        
                        for p in pagamento.parcelas:
                            p.status = "PAGO"
                        
                        if pagamento.inscricao:
                            status_anterior = pagamento.inscricao.status
                            pagamento.inscricao.status = "CONFIRMADA"
                            db.commit()
                            logger.warning(f"Reconciliação: Inscrição ID={pagamento.inscricao_id} alterada para CONFIRMADA.")
                            
                            if status_anterior != "CONFIRMADA":
                                try:
                                    enviar_email_confirmacao(
                                        destinatario_email=pagamento.inscricao.usuario.email,
                                        destinatario_nome=pagamento.inscricao.usuario.nome,
                                        nome_evento=pagamento.inscricao.evento.titulo
                                    )
                                    logger.warning(f"Reconciliação: E-mail de confirmação enviado para {pagamento.inscricao.usuario.email}")
                                except Exception as e_mail:
                                    logger.error(f"Erro ao enviar e-mail de reconciliação: {e_mail}")
                        else:
                            db.commit()
                except Exception as e_pag:
                    logger.error(f"Erro ao consultar pagamento ID={pagamento.id}: {e_pag}")
            
            await asyncio.sleep(0.5)

        # --- 2. RECONCILIAR PARCELAS INDIVIDUAIS DE CARNÊS ---
        parcelas_pendentes = db.query(Parcela).join(Pagamento).join(Inscricao).filter(
            Parcela.status == "PENDENTE",
            Pagamento.forma_pagamento == "PARCELADO",
            Inscricao.status != "CANCELADA"
        ).all()
        
        logger.warning(f"Reconciliação: Encontradas {len(parcelas_pendentes)} parcelas de carnê pendentes para verificar.")
        
        for parc in parcelas_pendentes:
            inscricao = parc.pagamento.inscricao
            candidate_nsus = [
                f"ORD-{inscricao.id}-PARC-{parc.numero}",
                f"PARCELA-{parc.id}",
                f"PARC-{parc.id}"
            ]
            if parc.copia_cola_pix and "order_nsu=" in parc.copia_cola_pix:
                try:
                    nsu_from_link = parc.copia_cola_pix.split("order_nsu=")[1].split("&")[0]
                    if nsu_from_link and nsu_from_link not in candidate_nsus:
                        candidate_nsus.append(nsu_from_link)
                except Exception:
                    pass

            pago_confirmado = False
            for order_nsu_parc in candidate_nsus:
                try:
                    res = infinitepay_service.consultar_status_pagamento(order_nsu=order_nsu_parc)
                    if res.get("paid") is True:
                        logger.warning(f"Reconciliação: Parcela ID={parc.id} consta como PAGA sob order_nsu={order_nsu_parc}!")
                        parc.status = "PAGO"
                        
                        pagamento = parc.pagamento
                        if res.get("paid_amount"):
                            pagamento.paid_amount = (pagamento.paid_amount or Decimal("0.00")) + Decimal(str(res.get("paid_amount"))) / 100
                        if res.get("capture_method"):
                            pagamento.capture_method = str(res.get("capture_method"))
                        db.commit()
                        
                        todas_pagas = all(p.status == "PAGO" for p in pagamento.parcelas)
                        if todas_pagas:
                            status_anterior = pagamento.status
                            pagamento.status = "PAGO"
                            inscricao.status = "CONFIRMADA"
                            db.commit()
                            logger.warning(f"Reconciliação: Todas as parcelas pagas! Inscrição ID={inscricao.id} CONFIRMADA.")
                            
                            if status_anterior != "PAGO":
                                try:
                                    enviar_email_confirmacao(
                                        destinatario_email=inscricao.usuario.email,
                                        destinatario_nome=inscricao.usuario.nome,
                                        nome_evento=inscricao.evento.titulo
                                    )
                                except Exception as e_mail:
                                    logger.error(f"Erro ao enviar e-mail de confirmação da parcela: {e_mail}")

                        pago_confirmado = True
                        break
                except Exception as e_cons:
                    logger.error(f"Erro ao consultar NSU {order_nsu_parc}: {e_cons}")

            # Se ainda não estiver pago, garantir que copia_cola_pix e qr_code estejam gerados e salvos
            if not pago_confirmado and not parc.copia_cola_pix:
                order_nsu_default = f"ORD-{inscricao.id}-PARC-{parc.numero}"
                try:
                    res_chk = infinitepay_service.criar_checkout_link(
                        order_nsu=order_nsu_default,
                        valor=parc.valor,
                        descricao=f"Inscrição {inscricao.evento.titulo if inscricao.evento else 'Evento'} - Parcela {parc.numero}/{len(parc.pagamento.parcelas)}",
                        customer_email=inscricao.usuario.email,
                        customer_name=inscricao.usuario.nome,
                        redirect_url="https://inscricoessinodalpb.netlify.app/usuario/dashboard.html"
                    )
                    parc.copia_cola_pix = res_chk.get("checkout_url")
                except Exception:
                    val_fmt = f"{float(parc.valor):.2f}".replace(".", ",")
                    parc.copia_cola_pix = f"https://pay.infinitepay.io/{infinitepay_service.handle}/{val_fmt}?order_nsu={order_nsu_default}"
                parc.qr_code_pix = gerar_qr_code_base64(parc.copia_cola_pix)
                db.commit()
            
            await asyncio.sleep(0.5)

        # --- 3. RECONCILIAR TRIAGENS PENDENTES (REGULAR E DIÁRIA) ---
        triagens_pendentes = db.query(InscricaoTriagem).filter(
            InscricaoTriagem.status == "PENDENTE_PAGAMENTO"
        ).all()
        for tr in triagens_pendentes:
            cands = [f"TRIAGEM-{tr.id}"]
            if tr.forma_pagamento == "PARCELADO":
                cands.append(f"TRIAGEM-{tr.id}-PARC-1")
            for c in cands:
                try:
                    res_tr = infinitepay_service.consultar_status_pagamento(order_nsu=c)
                    if res_tr.get("paid") is True:
                        p_amt = Decimal(str(res_tr.get("paid_amount"))) / 100 if res_tr.get("paid_amount") else tr.valor_total
                        c_mth = str(res_tr.get("capture_method") or "")
                        converter_triagem_em_inscricao(
                            db=db,
                            triagem=tr,
                            order_nsu=c,
                            paid_amount=p_amt,
                            capture_method=c_mth,
                            parcela_num_paga=1
                        )
                        break
                except Exception as e_tr:
                    logger.error(f"Erro ao consultar triagem {tr.id}: {e_tr}")
            await asyncio.sleep(0.5)

        diarias_pendentes = db.query(DiariaTriagem).filter(
            DiariaTriagem.status == "PENDENTE_PAGAMENTO"
        ).all()
        for td in diarias_pendentes:
            order_nsu_td = f"DIARIA_TRIAGEM-{td.id}"
            try:
                res_td = infinitepay_service.consultar_status_pagamento(order_nsu=order_nsu_td)
                if res_td.get("paid") is True:
                    p_amt = Decimal(str(res_td.get("paid_amount"))) / 100 if res_td.get("paid_amount") else td.valor_total
                    c_mth = str(res_td.get("capture_method") or "")
                    converter_triagem_em_diaria(
                        db=db,
                        triagem=td,
                        order_nsu=order_nsu_td,
                        paid_amount=p_amt,
                        capture_method=c_mth
                    )
            except Exception as e_td:
                logger.error(f"Erro ao consultar triagem de diária {td.id}: {e_td}")
            await asyncio.sleep(0.5)

        # --- 4. PROCESSAR ALERTAS E LEMBRETES DE VENCIMENTO ---
        try:
            processar_alertas_vencimento(db)
        except Exception as e_alertas:
            logger.error(f"Erro ao processar alertas de vencimento: {e_alertas}")
            
    except Exception as e:
        logger.error(f"Erro durante a execução do job de reconciliação: {e}")
    finally:
        db.close()


def processar_alertas_vencimento(db):
    """
    Verifica datas de vencimento de parcelas ativas e envia notificações automáticas.
    Garante que o link de pagamento esteja gerado e persistido antes de enviar o e-mail.
    - Lembrete prévio: 3 dias antes do vencimento.
    - Lembrete de atraso: 1 dia após o vencimento.
    """
    hoje = get_hoje_brasil()
    logger.warning("Verificando lembretes de vencimento de parcelas...")

    def assegurar_link_parcela(parc):
        if not parc.copia_cola_pix and parc.pagamento and parc.pagamento.inscricao:
            ins = parc.pagamento.inscricao
            order_nsu_parc = f"ORD-{ins.id}-PARC-{parc.numero}"
            try:
                res = infinitepay_service.criar_checkout_link(
                    order_nsu=order_nsu_parc,
                    valor=parc.valor,
                    descricao=f"Inscrição {ins.evento.titulo if ins.evento else 'Evento'} - Parcela {parc.numero}",
                    customer_email=ins.usuario.email,
                    customer_name=ins.usuario.nome,
                    redirect_url="https://inscricoessinodalpb.netlify.app/usuario/dashboard.html"
                )
                parc.copia_cola_pix = res.get("checkout_url")
            except Exception:
                val_fmt = f"{float(parc.valor):.2f}".replace(".", ",")
                parc.copia_cola_pix = f"https://pay.infinitepay.io/{infinitepay_service.handle}/{val_fmt}?order_nsu={order_nsu_parc}"
            parc.qr_code_pix = gerar_qr_code_base64(parc.copia_cola_pix)
            db.commit()

    # 1. Alerta prévio: nos próximos 3 dias (e ainda não enviado)
    data_previo = hoje + timedelta(days=3)
    parcelas_previo = db.query(Parcela).join(Pagamento).join(Inscricao).filter(
        Parcela.status == "PENDENTE",
        Parcela.vencimento <= data_previo,
        Parcela.vencimento >= hoje,
        Parcela.alerta_previo_enviado == False,
        Inscricao.status != "CANCELADA"
    ).all()

    logger.warning(f"Lembretes prévios a enviar (3 dias): {len(parcelas_previo)}")
    for parc in parcelas_previo:
        try:
            assegurar_link_parcela(parc)
            enviar_email_alerta_vencimento(
                destinatario_email=parc.pagamento.inscricao.usuario.email,
                destinatario_nome=parc.pagamento.inscricao.usuario.nome,
                nome_evento=parc.pagamento.inscricao.evento.titulo,
                numero_parcela=parc.numero,
                valor=float(parc.valor),
                vencimento=parc.vencimento,
                link_pagamento=parc.copia_cola_pix,
                atrasado=False
            )
            parc.alerta_previo_enviado = True
            db.commit()
            logger.info(f"Lembrete prévio de vencimento enviado para Parcela ID={parc.id}")
        except Exception as e:
            logger.error(f"Erro ao enviar lembrete prévio para parcela ID={parc.id}: {e}")

    # 2. Alerta de atraso: vencimento no passado há 1 dia ou mais (e ainda não enviado)
    data_atraso = hoje - timedelta(days=1)
    parcelas_atraso = db.query(Parcela).join(Pagamento).join(Inscricao).filter(
        Parcela.status == "PENDENTE",
        Parcela.vencimento <= data_atraso,
        Parcela.alerta_atraso_enviado == False,
        Inscricao.status != "CANCELADA"
    ).all()

    logger.warning(f"Lembretes de atraso a enviar (1 dia): {len(parcelas_atraso)}")
    for parc in parcelas_atraso:
        try:
            assegurar_link_parcela(parc)
            enviar_email_alerta_vencimento(
                destinatario_email=parc.pagamento.inscricao.usuario.email,
                destinatario_nome=parc.pagamento.inscricao.usuario.nome,
                nome_evento=parc.pagamento.inscricao.evento.titulo,
                numero_parcela=parc.numero,
                valor=float(parc.valor),
                vencimento=parc.vencimento,
                link_pagamento=parc.copia_cola_pix,
                atrasado=True
            )
            parc.alerta_atraso_enviado = True
            db.commit()
            logger.info(f"Lembrete de atraso enviado para Parcela ID={parc.id}")
        except Exception as e:
            logger.error(f"Erro ao enviar lembrete de atraso para parcela ID={parc.id}: {e}")


async def reconciliation_loop():
    """
    Loop infinito rodando a cada 10 minutos para reconciliar pagamentos.
    """
    logger.warning("Loop de reconciliação de pagamentos iniciado.")
    await asyncio.sleep(60.0)
    while True:
        try:
            await reconciliar_pagamentos_pendentes()
        except Exception as e:
            logger.error(f"Erro no loop de reconciliação: {e}")
        await asyncio.sleep(600.0)
