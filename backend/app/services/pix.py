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
    Retorna o link de checkout dinâmico da InfinitePay com o handle configurado.
    """
    from app.services.infinitepay import infinitepay_service
    val_str = f"{float(valor):.2f}".replace(".", ",")
    return f"https://pay.infinitepay.io/{infinitepay_service.handle}/{val_str}?order_nsu={txid}"


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
