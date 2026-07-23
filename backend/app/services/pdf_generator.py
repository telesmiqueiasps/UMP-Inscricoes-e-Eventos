import io
import base64
from decimal import Decimal
from datetime import date
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
import qrcode

from app.services.pix import gerar_copia_cola_pix


def gerar_pdf_parcela(
    parcela_id: int,
    numero_parcela: int,
    total_parcelas: int,
    vencimento: date,
    valor: Decimal | float,
    status: str,
    nome_participante: str,
    cpf_participante: str | None,
    nome_evento: str,
    copia_cola_pix: str | None = None
) -> bytes:
    """
    Gera um PDF em memória (bytes) semelhante a um carnê/comprovante de parcela contendo:
    - Logotipo / Cabeçalho do evento
    - Dados do Participante e do Evento
    - Número da Parcela (ex: 1 / 3) e Vencimento
    - Valor da Parcela
    - Código Pix Copia e Cola
    - QR Code do Pix gerado dinamicamente
    - Status do pagamento
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=1.5 * cm,
        leftMargin=1.5 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.5 * cm
    )

    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontSize=18,
        textColor=colors.HexColor('#1E293B'),
        fontName='Helvetica-Bold',
        alignment=0,
        spaceAfter=4
    )

    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#64748B'),
        fontName='Helvetica',
        alignment=0
    )

    header_right_style = ParagraphStyle(
        'HeaderRight',
        parent=styles['Normal'],
        fontSize=12,
        textColor=colors.HexColor('#2563EB'),
        fontName='Helvetica-Bold',
        alignment=2
    )

    label_style = ParagraphStyle(
        'LabelStyle',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.HexColor('#64748B'),
        fontName='Helvetica-Bold'
    )

    value_style = ParagraphStyle(
        'ValueStyle',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#0F172A'),
        fontName='Helvetica'
    )

    value_bold_style = ParagraphStyle(
        'ValueBoldStyle',
        parent=styles['Normal'],
        fontSize=12,
        textColor=colors.HexColor('#0F172A'),
        fontName='Helvetica-Bold'
    )

    pix_code_style = ParagraphStyle(
        'PixCodeStyle',
        parent=styles['Normal'],
        fontSize=7,
        textColor=colors.HexColor('#334155'),
        fontName='Courier',
        wordWrap='CJK'
    )

    story = []

    # 1. Header Table
    header_data = [
        [
            Paragraph(f"<b>{nome_evento}</b>", title_style),
            Paragraph(f"PARCELA {numero_parcela}/{total_parcelas}", header_right_style)
        ],
        [
            Paragraph("CARNÊ DE PAGAMENTO / COMPROVANTE DE PARCELA", subtitle_style),
            Paragraph(f"Status: <b>{status.upper()}</b>", header_right_style)
        ]
    ]
    header_table = Table(header_data, colWidths=[12 * cm, 6 * cm])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#CBD5E1'), spaceAfter=15))

    # 2. Informações Principais Grid
    if not copia_cola_pix:
        copia_cola_pix = gerar_copia_cola_pix(valor=valor, txid=f"PARC{parcela_id}")

    vencimento_str = vencimento.strftime("%d/%m/%Y") if isinstance(vencimento, (date)) else str(vencimento)
    valor_str = f"R$ {float(valor):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

    grid_data = [
        [
            Paragraph("NOME DO PARTICIPANTE", label_style),
            Paragraph("CPF / DOCUMENTO", label_style),
            Paragraph("VENCIMENTO", label_style),
            Paragraph("VALOR DA PARCELA", label_style)
        ],
        [
            Paragraph(nome_participante, value_bold_style),
            Paragraph(cpf_participante or "Não informado", value_style),
            Paragraph(vencimento_str, value_bold_style),
            Paragraph(valor_str, value_bold_style)
        ]
    ]

    info_table = Table(grid_data, colWidths=[6 * cm, 4 * cm, 4 * cm, 4 * cm])
    info_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F8FAFC')),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#E2E8F0')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 20))

    # 3. Gerar Imagem do QR Code Pix
    qr = qrcode.QRCode(version=1, box_size=5, border=1)
    qr.add_data(copia_cola_pix)
    qr.make(fit=True)
    img_qr = qr.make_image(fill_color="black", back_color="white")
    
    qr_img_buffer = io.BytesIO()
    img_qr.save(qr_img_buffer, format="PNG")
    qr_img_buffer.seek(0)
    
    qr_image_flowable = Image(qr_img_buffer, width=4.5 * cm, height=4.5 * cm)

    # 4. Tabela com QR Code e Pix/Checkout Link
    is_link = str(copia_cola_pix).startswith("http")
    
    if is_link:
        titulo_instrucoes = "<b>INSTRUÇÕES DE PAGAMENTO (ONLINE / CHECKOUT)</b>"
        item_1 = "1. Escaneie o QR Code ao lado usando a <b>câmera do seu celular</b> (não use o app do banco)."
        item_2 = "2. Você será redirecionado para a página de pagamento seguro da InfinitePay."
        item_3 = "3. Na página, escolha a forma de pagamento desejada (Pix ou Cartão de Crédito)."
        item_4 = "4. Se preferir, copie o endereço do link abaixo e acesse no seu navegador:"
    else:
        titulo_instrucoes = "<b>INSTRUÇÕES DE PAGAMENTO VIA PIX</b>"
        item_1 = "1. Abra o aplicativo do seu banco ou instituição financeira."
        item_2 = "2. Escolha a opção <b>Pix Copia e Cola</b> ou <b>Ler QR Code</b>."
        item_3 = "3. Escaneie o QR Code ao lado usando o aplicativo do banco."
        item_4 = "4. Se preferir, copie a chave de pagamento abaixo e cole no seu banco:"

    pix_instructions = [
        Paragraph(titulo_instrucoes, ParagraphStyle('PixHead', parent=styles['Normal'], fontSize=11, fontName='Helvetica-Bold', textColor=colors.HexColor('#0F172A'))),
        Spacer(1, 6),
        Paragraph(item_1, value_style),
        Paragraph(item_2, value_style),
        Paragraph(item_3, value_style),
        Paragraph(item_4, value_style),
        Spacer(1, 6),
        Paragraph(copia_cola_pix, pix_code_style)
    ]

    pix_data = [
        [qr_image_flowable, pix_instructions]
    ]

    pix_table = Table(pix_data, colWidths=[5 * cm, 13 * cm])
    pix_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F1F5F9')),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#CBD5E1')),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(pix_table)
    story.append(Spacer(1, 25))

    # 5. Rodapé Informativo / Linha de corte
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#94A3B8'), spaceAfter=10, hAlign='CENTER'))
    story.append(Paragraph("Documento emitido eletronicamente pela Plataforma de Eventos. Não vale como documento fiscal tributário.", subtitle_style))

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
