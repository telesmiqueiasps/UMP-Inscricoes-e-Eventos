import httpx
import logging
from app.core.config import settings


def enviar_email_brevo(destinatario_email: str, destinatario_nome: str, assunto: str, conteudo_html: str) -> bool:
    """
    Função base para envio de e-mails usando a API do Brevo (antigo Sendinblue).
    """
    url = "https://api.brevo.com/v3/smtp/email"
    headers = {
        "accept": "application/json",
        "api-key": settings.BREVO_API_KEY,
        "content-type": "application/json"
    }

    payload = {
        "sender": {
            "name": settings.BREVO_SENDER_NAME,
            "email": settings.BREVO_SENDER_EMAIL
        },
        "to": [
            {
                "email": destinatario_email,
                "name": destinatario_nome
            }
        ],
        "subject": assunto,
        "htmlContent": conteudo_html
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(url, json=payload, headers=headers)
            if response.status_code in [200, 201, 202]:
                logging.info(f"E-mail enviado com sucesso para {destinatario_email}: {assunto}")
                return True
            else:
                logging.error(f"Erro ao enviar e-mail Brevo ({response.status_code}): {response.text}")
                return False
    except Exception as e:
        logging.error(f"Exceção ao enviar e-mail Brevo: {e}")
        return False


def enviar_email_inscricao(destinatario_email: str, destinatario_nome: str, nome_evento: str, valor: float, forma_pagamento: str) -> bool:
    """
    Envia e-mail notificando a realização de uma nova inscrição.
    """
    assunto = f"Inscrição Recebida! - {nome_evento}"
    valor_fmt = f"R$ {valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    
    conteudo_html = f"""
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;">
        <h2 style="color: #4F46E5; margin-bottom: 20px; text-align: center;">Inscrição Realizada com Sucesso!</h2>
        <p>Olá, <strong>{destinatario_nome}</strong>,</p>
        <p>Recebemos o seu pedido de inscrição para o evento <strong>{nome_evento}</strong>.</p>
        
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Forma de Pagamento:</strong> {forma_pagamento}</p>
            <p style="margin: 5px 0;"><strong>Valor Total:</strong> {valor_fmt}</p>
            <p style="margin: 5px 0;"><strong>Status da Inscrição:</strong> PENDENTE DE PAGAMENTO</p>
        </div>
        
        <p>Acesse o painel do participante para copiar o código Pix, baixar os PDF das parcelas ou concluir a transação no cartão:</p>
        <p style="text-align: center; margin-top: 25px;">
            <a href="https://usuariosinodalpb.netlify.app/dashboard.html" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Acessar Área do Participante</a>
        </p>
        
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-top: 30px; margin-bottom: 20px;" />
        <p style="font-size: 0.85rem; color: #666; text-align: center;">Sinodal UMP PB - Organização de Eventos</p>
    </div>
    """
    return enviar_email_brevo(destinatario_email, destinatario_nome, assunto, conteudo_html)


def enviar_email_confirmacao(destinatario_email: str, destinatario_nome: str, nome_evento: str) -> bool:
    """
    Envia e-mail confirmando o pagamento e aprovação da inscrição.
    """
    assunto = f"Inscrição Confirmada! 🎉 - {nome_evento}"
    
    conteudo_html = f"""
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;">
        <h2 style="color: #10B981; margin-bottom: 20px; text-align: center;">Sua Inscrição está Confirmada! 🎉</h2>
        <p>Olá, <strong>{destinatario_nome}</strong>,</p>
        <p>Temos o prazer de informar que identificamos o seu pagamento e a sua inscrição no evento <strong>{nome_evento}</strong> está <strong>CONFIRMADA</strong>!</p>
        
        <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; padding: 15px; border-radius: 6px; margin: 20px 0; color: #065f46;">
            <p style="margin: 5px 0;"><strong>Status da Inscrição:</strong> CONFIRMADA / PAGO</p>
            <p style="margin: 5px 0;">Sua vaga está garantida e o seu credenciamento foi liberado.</p>
        </div>
        
        <p>Você pode consultar o comprovante da inscrição a qualquer momento no seu painel:</p>
        <p style="text-align: center; margin-top: 25px;">
            <a href="https://usuariosinodalpb.netlify.app/dashboard.html" style="background-color: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Acessar Área do Participante</a>
        </p>
        
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-top: 30px; margin-bottom: 20px;" />
        <p style="font-size: 0.85rem; color: #666; text-align: center;">Sinodal UMP PB - Organização de Eventos</p>
    </div>
    """
    return enviar_email_brevo(destinatario_email, destinatario_nome, assunto, conteudo_html)


def enviar_email_alerta_vencimento(
    destinatario_email: str,
    destinatario_nome: str,
    nome_evento: str,
    numero_parcela: int,
    valor: float,
    vencimento,
    link_pagamento: str | None = None,
    atrasado: bool = False
) -> bool:
    """
    Envia e-mail alertando sobre o vencimento (ou atraso) de uma parcela de carnê.
    """
    valor_fmt = f"R$ {valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    vencimento_fmt = vencimento.strftime("%d/%m/%Y")
    
    if atrasado:
        assunto = f"⚠️ ALERTA DE ATRASO: Parcela {numero_parcela} vencida - {nome_evento}"
        status_color = "#EF4444"
        titulo_email = "Lembrete: Pagamento Não Identificado"
        mensagem = f"Identificamos que a sua parcela <strong>#{numero_parcela}</strong> no valor de <strong>{valor_fmt}</strong>, vencida em <strong>{vencimento_fmt}</strong>, ainda não foi quitada."
        cta_text = "Pagar Parcela Atrasada"
    else:
        assunto = f"⏰ Lembrete de Vencimento: Parcela {numero_parcela} a vencer - {nome_evento}"
        status_color = "#3B82F6"
        titulo_email = "Lembrete: Sua Parcela Vence em Breve"
        mensagem = f"Gostaríamos de lembrar que a sua parcela <strong>#{numero_parcela}</strong> no valor de <strong>{valor_fmt}</strong> vencerá no dia <strong>{vencimento_fmt}</strong>."
        cta_text = "Realizar Pagamento"

    link = link_pagamento or "https://usuariosinodalpb.netlify.app/dashboard.html"
    
    conteudo_html = f"""
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;">
        <h2 style="color: {status_color}; margin-bottom: 20px; text-align: center;">{titulo_email}</h2>
        <p>Olá, <strong>{destinatario_nome}</strong>,</p>
        <p>{mensagem}</p>
        
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Evento:</strong> {nome_evento}</p>
            <p style="margin: 5px 0;"><strong>Parcela:</strong> #{numero_parcela}</p>
            <p style="margin: 5px 0;"><strong>Valor:</strong> {valor_fmt}</p>
            <p style="margin: 5px 0;"><strong>Vencimento:</strong> {vencimento_fmt}</p>
        </div>
        
        <p>Para manter sua inscrição ativa, efetue o pagamento usando o link abaixo:</p>
        <p style="text-align: center; margin-top: 25px;">
            <a href="{link}" style="background-color: {status_color}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">{cta_text}</a>
        </p>
        
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-top: 30px; margin-bottom: 20px;" />
        <p style="font-size: 0.85rem; color: #666; text-align: center;">Sinodal UMP PB - Organização de Eventos</p>
    </div>
    """
    return enviar_email_brevo(destinatario_email, destinatario_nome, assunto, conteudo_html)
