import io
import base64
import qrcode
from decimal import Decimal
from app.core.config import settings


def format_emv_field(field_id: str, value: str) -> str:
    length = f"{len(value):02d}"
    return f"{field_id}{length}{value}"


def gerar_copia_cola_pix(
    valor: float | Decimal,
    chave_pix: str = None,
    nome_recebedor: str = None,
    cidade_recebedor: str = None,
    txid: str = "***"
) -> str:
    """
    Gera a string de Pix Copia e Cola de acordo com a especificação do Bacen (EMV QRCPS).
    """
    from app.services.config import get_pix_chave, get_pix_nome_recebedor, get_pix_cidade_recebedor
    chave = chave_pix or get_pix_chave()
    nome = (nome_recebedor or get_pix_nome_recebedor())[:25].upper()
    cidade = (cidade_recebedor or get_pix_cidade_recebedor())[:15].upper()
    
    val_str = f"{float(valor):.2f}"

    # Format merchant account information (ID 26)
    gui = format_emv_field("00", "br.gov.bcb.pix")
    key = format_emv_field("01", chave)
    merchant_account_info = format_emv_field("26", f"{gui}{key}")

    payload_parts = [
        format_emv_field("00", "01"),                      # Payload Format Indicator
        merchant_account_info,                             # Merchant Account Information
        format_emv_field("52", "0000"),                    # Merchant Category Code
        format_emv_field("53", "986"),                     # Transaction Currency (BRL)
        format_emv_field("54", val_str),                   # Transaction Amount
        format_emv_field("58", "BR"),                      # Country Code
        format_emv_field("59", nome),                      # Merchant Name
        format_emv_field("60", cidade),                    # Merchant City
        format_emv_field("62", format_emv_field("05", txid)) # Additional Data Field Template (txid)
    ]

    payload_without_crc = "".join(payload_parts) + "6304"
    
    # Simple CRC16 CCITT Calculation
    crc = calculate_crc16(payload_without_crc)
    return f"{payload_without_crc}{crc:04X}"


def calculate_crc16(payload: str) -> int:
    crc = 0xFFFF
    for char in payload.encode("utf-8"):
        crc ^= (char << 8)
        for _ in range(8):
            if (crc & 0x8000) != 0:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc


def gerar_qr_code_base64(texto_copia_cola: str) -> str:
    """
    Gera o QR Code a partir da string Copia e Cola e retorna como Data URI em Base64.
    """
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=2,
    )
    qr.add_data(texto_copia_cola)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    img_str = base64.b64encode(buffer.getvalue()).decode()
    return f"data:image/png;base64,{img_str}"
