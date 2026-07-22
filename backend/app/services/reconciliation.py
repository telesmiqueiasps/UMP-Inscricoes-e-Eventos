import asyncio
import logging
from datetime import datetime, timedelta
from app.core.database import SessionLocal
from app.models.pagamento import Pagamento
from app.models.inscricao import Inscricao
from app.services.infinitepay import infinitepay_service
from app.services.email import enviar_email_confirmacao

logger = logging.getLogger(__name__)


async def reconciliar_pagamentos_pendentes():
    """
    Busca pagamentos PENDENTE via InfinitePay criados nas últimas 24 horas,
    consulta a API de status 'payment_check' e atualiza no banco caso pago.
    """
    logger.warning("Iniciando job de reconciliação de pagamentos InfinitePay...")
    db = SessionLocal()
    try:
        # Buscar pagamentos pendentes criados nas últimas 24 horas
        um_dia_atras = datetime.utcnow() - timedelta(hours=24)
        pagamentos = db.query(Pagamento).filter(
            Pagamento.status == "PENDENTE",
            Pagamento.forma_pagamento.in_(["INFINITEPAY", "PIX"]),
            Pagamento.created_at >= um_dia_atras
        ).all()
        
        logger.warning(f"Encontrados {len(pagamentos)} pagamentos pendentes para verificar.")
        
        for pagamento in pagamentos:
            # Consultar status na InfinitePay se tiver order_nsu
            if pagamento.order_nsu:
                logger.warning(f"Consultando status do pagamento ID={pagamento.id}, order_nsu={pagamento.order_nsu}")
                res = infinitepay_service.consultar_status_pagamento(
                    order_nsu=pagamento.order_nsu,
                    transaction_nsu=pagamento.transaction_nsu,
                    slug=pagamento.invoice_slug
                )
                
                # Se a consulta retornou que está pago
                if res.get("paid") is True:
                    logger.warning(f"Reconciliação: Pagamento ID={pagamento.id} consta como PAGO no payment_check!")
                    
                    # Salvar dados adicionais
                    pagamento.status = "PAGO"
                    if res.get("paid_amount"):
                        from decimal import Decimal
                        pagamento.paid_amount = Decimal(str(res.get("paid_amount"))) / 100
                    if res.get("capture_method"):
                        pagamento.capture_method = str(res.get("capture_method"))
                    
                    # Atualizar status das parcelas se houver
                    for p in pagamento.parcelas:
                        p.status = "PAGO"
                    
                    # Confirmar inscrição
                    if pagamento.inscricao:
                        status_anterior = pagamento.inscricao.status
                        pagamento.inscricao.status = "CONFIRMADA"
                        db.commit()
                        logger.warning(f"Reconciliação: Inscrição ID={pagamento.inscricao_id} alterada para CONFIRMADA.")
                        
                        # Enviar e-mail se antes não estava confirmada
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
            
            # Dormir curto período entre chamadas para não sobrecarregar a API
            await asyncio.sleep(1.0)
            
    except Exception as e:
        logger.error(f"Erro durante a execução do job de reconciliação: {e}")
    finally:
        db.close()


async def reconciliation_loop():
    """
    Loop infinito rodando a cada 10 minutos para reconciliar pagamentos.
    """
    logger.warning("Loop de reconciliação de pagamentos iniciado.")
    # Aguardar 60 segundos após a inicialização para não sobrecarregar o startup do app
    await asyncio.sleep(60.0)
    while True:
        try:
            await reconciliar_pagamentos_pendentes()
        except Exception as e:
            logger.error(f"Erro no loop de reconciliação: {e}")
        # Aguardar 10 minutos (600 segundos) antes da próxima varredura
        await asyncio.sleep(600.0)
