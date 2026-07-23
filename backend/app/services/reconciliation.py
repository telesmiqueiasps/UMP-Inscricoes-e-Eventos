import asyncio
import logging
from datetime import datetime, timedelta, date
from app.core.database import SessionLocal
from app.models.pagamento import Pagamento
from app.models.inscricao import Inscricao
from app.models.parcela import Parcela
from app.services.infinitepay import infinitepay_service
from app.services.email import enviar_email_confirmacao

logger = logging.getLogger(__name__)


async def reconciliar_pagamentos_pendentes():
    """
    Busca pagamentos PENDENTE via InfinitePay criados nas últimas 24 horas,
    consulta a API de status 'payment_check' e atualiza no banco caso pago.
    Também reconcilia as parcelas individuais de carnê de forma independente.
    """
    logger.warning("Iniciando job de reconciliação de pagamentos InfinitePay...")
    db = SessionLocal()
    try:
        # --- 1. RECONCILIAR PAGAMENTOS À VISTA (PIX/INFINITEPAY) ---
        um_dia_atras = datetime.utcnow() - timedelta(hours=24)
        pagamentos = db.query(Pagamento).filter(
            Pagamento.status == "PENDENTE",
            Pagamento.forma_pagamento.in_(["INFINITEPAY", "PIX"]),
            Pagamento.created_at >= um_dia_atras
        ).all()
        
        logger.warning(f"Reconciliação: Encontrados {len(pagamentos)} pagamentos à vista pendentes para verificar.")
        
        for pagamento in pagamentos:
            if pagamento.order_nsu:
                logger.warning(f"Consultando status do pagamento ID={pagamento.id}, order_nsu={pagamento.order_nsu}")
                res = infinitepay_service.consultar_status_pagamento(
                    order_nsu=pagamento.order_nsu,
                    transaction_nsu=pagamento.transaction_nsu,
                    slug=pagamento.invoice_slug
                )
                
                if res.get("paid") is True:
                    logger.warning(f"Reconciliação: Pagamento ID={pagamento.id} consta como PAGO no payment_check!")
                    
                    pagamento.status = "PAGO"
                    if res.get("paid_amount"):
                        from decimal import Decimal
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
                else:
                    logger.warning(f"Reconciliação: Pagamento ID={pagamento.id} ainda consta como pendente ou não pago.")
            
            await asyncio.sleep(1.0)

        # --- 2. RECONCILIAR PARCELAS INDIVIDUAIS DE CARNÊS ---
        dois_dias_atras = datetime.utcnow() - timedelta(days=2)
        parcelas_pendentes = db.query(Parcela).join(Pagamento).filter(
            Parcela.status == "PENDENTE",
            Pagamento.forma_pagamento == "PARCELADO",
            Parcela.created_at >= dois_dias_atras
        ).all()
        
        logger.warning(f"Reconciliação: Encontradas {len(parcelas_pendentes)} parcelas de carnê pendentes para verificar.")
        
        for parc in parcelas_pendentes:
            order_nsu_parc = f"ORD-{parc.pagamento.inscricao_id}-PARC-{parc.numero}"
            logger.warning(f"Consultando status da parcela ID={parc.id}, order_nsu={order_nsu_parc}")
            res = infinitepay_service.consultar_status_pagamento(
                order_nsu=order_nsu_parc
            )
            
            if res.get("paid") is True:
                logger.warning(f"Reconciliação: Parcela ID={parc.id} consta como PAGA!")
                parc.status = "PAGO"
                db.commit()
                
                pagamento = parc.pagamento
                if res.get("paid_amount"):
                    from decimal import Decimal
                    pagamento.paid_amount = (pagamento.paid_amount or Decimal("0.00")) + Decimal(str(res.get("paid_amount"))) / 100
                if res.get("capture_method"):
                    pagamento.capture_method = str(res.get("capture_method"))
                db.commit()
                
                # Se todas foram pagas, dar baixa completa
                todas_pagas = all(p.status == "PAGO" for p in pagamento.parcelas)
                if todas_pagas:
                    status_anterior = pagamento.status
                    pagamento.status = "PAGO"
                    pagamento.inscricao.status = "CONFIRMADA"
                    db.commit()
                    logger.warning(f"Reconciliação: Todas as parcelas pagas! Inscrição ID={pagamento.inscricao_id} CONFIRMADA.")
                    
                    if status_anterior != "PAGO":
                        try:
                            enviar_email_confirmacao(
                                destinatario_email=pagamento.inscricao.usuario.email,
                                destinatario_nome=pagamento.inscricao.usuario.nome,
                                nome_evento=pagamento.inscricao.evento.titulo
                            )
                        except Exception as e_mail:
                            logger.error(f"Erro ao enviar e-mail de confirmação da parcela: {e_mail}")
            
            await asyncio.sleep(1.0)

        # --- 3. PROCESSAR ALERTAS E LEMBRETES DE VENCIMENTO ---
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
    - Lembrete prévio: 3 dias antes do vencimento.
    - Lembrete de atraso: 1 dia após o vencimento.
    """
    from datetime import date, timedelta
    from app.services.email import enviar_email_alerta_vencimento

    hoje = date.today()
    logger.warning("Verificando lembretes de vencimento de parcelas...")

    # 1. Alerta prévio: 3 dias antes
    data_previo = hoje + timedelta(days=3)
    parcelas_previo = db.query(Parcela).join(Pagamento).filter(
        Parcela.status == "PENDENTE",
        Parcela.vencimento == data_previo,
        Parcela.alerta_previo_enviado == False
    ).all()

    logger.warning(f"Lembretes prévios a enviar (3 dias): {len(parcelas_previo)}")
    for parc in parcelas_previo:
        try:
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

    # 2. Alerta de atraso: 1 dia após
    data_atraso = hoje - timedelta(days=1)
    parcelas_atraso = db.query(Parcela).join(Pagamento).filter(
        Parcela.status == "PENDENTE",
        Parcela.vencimento == data_atraso,
        Parcela.alerta_atraso_enviado == False
    ).all()

    logger.warning(f"Lembretes de atraso a enviar (1 dia): {len(parcelas_atraso)}")
    for parc in parcelas_atraso:
        try:
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
