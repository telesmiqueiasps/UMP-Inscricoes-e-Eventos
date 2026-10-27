from fastapi import APIRouter, Depends, HTTPException, status, Response, Request, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from decimal import Decimal
from app.services.email import enviar_email_confirmacao

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.usuario import Usuario
from app.models.inscricao import Inscricao
from app.models.inscricao_triagem import InscricaoTriagem
from app.models.pagamento import Pagamento
from app.models.parcela import Parcela
from app.schemas.pagamento import PagamentoResponse, ParcelaResponse
from app.services.parcelamento import gerar_parcelas, calcular_max_parcelas, get_hoje_brasil
from app.services.pix import gerar_qr_code_base64
from app.services.infinitepay import infinitepay_service
from app.services.pdf_generator import gerar_pdf_parcela
from datetime import datetime, date
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pagamentos", tags=["Pagamentos"])


class ProcessarPagamentoRequest(BaseModel):
    inscricao_id: int
    forma_pagamento: str  # PIX, INFINITEPAY, PARCELADO
    num_parcelas: Optional[int] = 1
    data_primeira_parcela: Optional[str] = None  # Formato YYYY-MM-DD


class ProcessarTriagemRequest(BaseModel):
    triagem_id: int


@router.post("/processar-triagem")
def processar_pagamento_triagem(
    req: ProcessarTriagemRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    triagem = db.query(InscricaoTriagem).filter(InscricaoTriagem.id == req.triagem_id).first()
    if not triagem:
        raise HTTPException(status_code=404, detail="Triagem de inscrição não encontrada.")

    if triagem.usuario_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acesso negado a esta triagem.")

    evento = triagem.evento
    if evento and evento.valor is not None and triagem.status == "PENDENTE_PAGAMENTO" and triagem.valor_total != evento.valor:
        triagem.valor_total = evento.valor
        db.commit()
        db.refresh(triagem)

    forma_pag = (triagem.forma_pagamento or "PIX").upper()

    receipt_url = None
    copia_cola_pix = None
    qr_code_pix = None
    parcelas_info = []

    if forma_pag == "PIX":
        if evento.link_pagamento_pix:
            copia_cola_pix = evento.link_pagamento_pix
            qr_code_pix = gerar_qr_code_base64(copia_cola_pix)
            receipt_url = copia_cola_pix
        else:
            order_nsu = f"TRIAGEM-{triagem.id}"
            result = infinitepay_service.criar_checkout_link(
                order_nsu=order_nsu,
                valor=triagem.valor_total,
                descricao=f"Inscrição Evento #{evento.id} - {evento.titulo} (Pix)",
                customer_email=current_user.email,
                customer_name=current_user.nome
            )
            receipt_url = result.get("checkout_url")
            copia_cola_pix = receipt_url
            qr_code_pix = ""

    elif forma_pag == "INFINITEPAY":
        order_nsu = f"TRIAGEM-{triagem.id}"
        if evento.link_pagamento_cartao:
            receipt_url = evento.link_pagamento_cartao
        else:
            result = infinitepay_service.criar_checkout_link(
                order_nsu=order_nsu,
                valor=triagem.valor_total,
                descricao=f"Inscrição Evento #{evento.id} - {evento.titulo}",
                customer_email=current_user.email,
                customer_name=current_user.nome
            )
            receipt_url = result.get("checkout_url")

    elif forma_pag == "PARCELADO":
        dt_primeira = triagem.data_primeira_parcela or get_hoje_brasil()
        if dt_primeira < get_hoje_brasil():
            dt_primeira = get_hoje_brasil()

        dt_limite = evento.data_inicio.date() if evento.data_inicio else dt_primeira

        max_permitido = calcular_max_parcelas(dt_primeira, dt_limite)
        n_parcelas = min(max(triagem.num_parcelas or 1, 1), max(max_permitido, 1))

        parcelas_calc = gerar_parcelas(
            valor_total=triagem.valor_total,
            num_parcelas=n_parcelas,
            data_primeira_parcela=dt_primeira,
            data_limite_evento=dt_limite
        )

        for item in parcelas_calc:
            order_nsu_parc = f"TRIAGEM-{triagem.id}-PARC-{item['numero']}"
            try:
                res = infinitepay_service.criar_checkout_link(
                    order_nsu=order_nsu_parc,
                    valor=item["valor"],
                    descricao=f"Inscrição Evento #{evento.id} - Parcela {item['numero']}/{n_parcelas}",
                    customer_email=current_user.email,
                    customer_name=current_user.nome
                )
                link_parc = res.get("checkout_url")
            except Exception:
                val_fmt = f"{float(item['valor']):.2f}".replace(".", ",")
                link_parc = f"https://pay.infinitepay.io/{infinitepay_service.handle}/{val_fmt}?order_nsu={order_nsu_parc}"

            qr_b64_parc = gerar_qr_code_base64(link_parc)
            pdf_url_parc = f"/pagamentos/triagem/{triagem.id}/parcela/{item['numero']}/pdf"

            parcelas_info.append({
                "numero": item["numero"],
                "vencimento": item["vencimento"].isoformat(),
                "valor": float(item["valor"]),
                "status": "PENDENTE",
                "copia_cola_pix": link_parc,
                "qr_code_pix": qr_b64_parc,
                "pdf_url": pdf_url_parc
            })

    return {
        "triagem_id": triagem.id,
        "forma_pagamento": forma_pag,
        "valor_total": float(triagem.valor_total),
        "receipt_url": receipt_url,
        "copia_cola_pix": copia_cola_pix,
        "qr_code_pix": qr_code_pix,
        "parcelas": parcelas_info
    }


@router.post("/processar", response_model=PagamentoResponse)
def processar_pagamento(
    req: ProcessarPagamentoRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    inscricao = db.query(Inscricao).filter(Inscricao.id == req.inscricao_id).first()
    if not inscricao:
        raise HTTPException(status_code=404, detail="Inscrição não encontrada.")

    if inscricao.usuario_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acesso negado a esta inscrição.")

    if inscricao.status == "CANCELADA":
        raise HTTPException(status_code=400, detail="Esta inscrição está cancelada. Não é possível processar pagamentos.")

    forma_pag = req.forma_pagamento.upper()
    if forma_pag not in ["PIX", "INFINITEPAY", "PARCELADO"]:
        raise HTTPException(status_code=400, detail="Forma de pagamento inválida.")

    # Atualizar forma de pagamento na inscrição
    inscricao.forma_pagamento = forma_pag

    # Remover pagamentos anteriores em aberto se houver
    db.query(Pagamento).filter(
        Pagamento.inscricao_id == inscricao.id,
        Pagamento.status == "PENDENTE"
    ).delete()
    db.commit()

    db_pagamento = Pagamento(
        inscricao_id=inscricao.id,
        forma_pagamento=forma_pag,
        valor=inscricao.valor_total,
        status="PENDENTE"
    )
    db.add(db_pagamento)
    db.commit()
    db.refresh(db_pagamento)

    if forma_pag == "PIX":
        # Se o evento tiver um link de pagamento Pix pré-configurado pelo admin, usa ele diretamente
        if inscricao.evento.link_pagamento_pix:
            copia_cola = inscricao.evento.link_pagamento_pix
            qr_code_b64 = gerar_qr_code_base64(copia_cola)
            db_pagamento.receipt_url = copia_cola
            db_pagamento.copia_cola_pix = copia_cola
            db_pagamento.qr_code_pix = qr_code_b64
        else:
            # Gerar link do checkout da InfinitePay para o Pix
            order_nsu = f"ORD-{inscricao.id}-{db_pagamento.id}"
            result = infinitepay_service.criar_checkout_link(
                order_nsu=order_nsu,
                valor=inscricao.valor_total,
                descricao=f"Inscrição Evento #{inscricao.evento_id} - {inscricao.evento.titulo} (Pix)",
                customer_email=current_user.email,
                customer_name=current_user.nome
            )
            db_pagamento.order_nsu = order_nsu
            db_pagamento.receipt_url = result.get("checkout_url")
            db_pagamento.invoice_slug = result.get("invoice_slug")
            
            copia_cola = result.get("checkout_url")
            qr_code_b64 = "" # Sem QR code local já que usará o checkout da InfinitePay
            
            db_pagamento.copia_cola_pix = copia_cola
            db_pagamento.qr_code_pix = qr_code_b64

        # Criar 1 parcela única para o Pix
        parc = Parcela(
            pagamento_id=db_pagamento.id,
            numero=1,
            vencimento=inscricao.created_at.date(),
            valor=inscricao.valor_total,
            copia_cola_pix=copia_cola,
            qr_code_pix=qr_code_b64,
            status="PENDENTE"
        )
        db.add(parc)

    elif forma_pag == "INFINITEPAY":
        order_nsu = f"ORD-{inscricao.id}-{db_pagamento.id}"
        
        # Se o evento tiver um link de pagamento de cartão pré-configurado pelo admin, usa ele diretamente
        if inscricao.evento.link_pagamento_cartao:
            db_pagamento.order_nsu = order_nsu
            db_pagamento.receipt_url = inscricao.evento.link_pagamento_cartao
        else:
            # Chamar InfinitePay para gerar o link do checkout do cartão
            result = infinitepay_service.criar_checkout_link(
                order_nsu=order_nsu,
                valor=inscricao.valor_total,
                descricao=f"Inscrição Evento #{inscricao.evento_id} - {inscricao.evento.titulo}",
                customer_email=current_user.email,
                customer_name=current_user.nome
            )

            db_pagamento.order_nsu = order_nsu
            db_pagamento.receipt_url = result.get("checkout_url")
            db_pagamento.invoice_slug = result.get("invoice_slug")

    elif forma_pag == "PARCELADO":
        from datetime import datetime, date
        from app.services.parcelamento import calcular_max_parcelas
        
        # 1. Resolver data da primeira parcela
        if req.data_primeira_parcela:
            try:
                data_primeira_parcela = datetime.strptime(req.data_primeira_parcela, "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(status_code=400, detail="Formato de data inválido. Use AAAA-MM-DD.")
        else:
            data_primeira_parcela = get_hoje_brasil() + timedelta(days=30)

        # A data da primeira parcela não pode ser anterior a hoje
        if data_primeira_parcela < get_hoje_brasil():
            data_primeira_parcela = get_hoje_brasil()

        data_limite = inscricao.evento.data_inicio.date()

        # 2. Calcular máximo de parcelas permitidas
        max_permitido = calcular_max_parcelas(data_primeira_parcela, data_limite)
        if max_permitido < 1:
            raise HTTPException(
                status_code=400,
                detail="A data de vencimento selecionada é posterior ao início do evento. Parcelamento indisponível."
            )
            
        n_parcelas = min(max(req.num_parcelas or 1, 1), max_permitido)

        parcelas_calculadas = gerar_parcelas(
            valor_total=inscricao.valor_total,
            num_parcelas=n_parcelas,
            data_primeira_parcela=data_primeira_parcela,
            data_limite_evento=data_limite
        )

        for item in parcelas_calculadas:
            order_nsu_parc = f"ORD-{inscricao.id}-PARC-{item['numero']}"
            
            # Tentar gerar checkout link dinâmico na InfinitePay para cada parcela
            try:
                res = infinitepay_service.criar_checkout_link(
                    order_nsu=order_nsu_parc,
                    valor=item["valor"],
                    descricao=f"Inscrição Evento #{inscricao.evento_id} - Parcela {item['numero']}/{n_parcelas}",
                    customer_email=current_user.email,
                    customer_name=current_user.nome
                )
                copia_cola_parc = res.get("checkout_url")
            except Exception:
                val_fmt = f"{float(item['valor']):.2f}".replace(".", ",")
                copia_cola_parc = f"https://pay.infinitepay.io/{infinitepay_service.handle}/{val_fmt}?order_nsu={order_nsu_parc}"

            qr_b64_parc = gerar_qr_code_base64(copia_cola_parc)

            parc = Parcela(
                pagamento_id=db_pagamento.id,
                numero=item["numero"],
                vencimento=item["vencimento"],
                valor=item["valor"],
                copia_cola_pix=copia_cola_parc,
                qr_code_pix=qr_b64_parc,
                status="PENDENTE"
            )
            db.add(parc)

    db.commit()
    db.refresh(db_pagamento)
    return db_pagamento


@router.get("/inscricao/{inscricao_id}", response_model=PagamentoResponse)
def obter_pagamento_inscricao(
    inscricao_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    pagamento = db.query(Pagamento).filter(Pagamento.inscricao_id == inscricao_id).order_by(Pagamento.created_at.desc()).first()
    if not pagamento:
        raise HTTPException(status_code=404, detail="Nenhum pagamento registrado para esta inscrição.")

    if pagamento.inscricao.usuario_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acesso negado a este pagamento.")

    if pagamento.inscricao.status == "CANCELADA":
        pagamento.status = "CANCELADO"
        for parc in pagamento.parcelas:
            parc.status = "CANCELADO"

    return pagamento


def obter_usuario_por_token_ou_query(
    request: Request,
    db: Session = Depends(get_db)
) -> Usuario:
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    else:
        token = request.query_params.get("token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Não autenticado."
        )

    try:
        from jose import jwt
        from app.core.config import settings
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Token inválido.")
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido.")

    user = db.query(Usuario).filter(Usuario.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado.")
    return user


@router.get("/parcelas/{parcela_id}/pdf")
def baixar_pdf_parcela(
    parcela_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(obter_usuario_por_token_ou_query)
):
    parcela = db.query(Parcela).filter(Parcela.id == parcela_id).first()
    if not parcela:
        raise HTTPException(status_code=404, detail="Parcela não encontrada.")

    pagamento = parcela.pagamento
    inscricao = pagamento.inscricao

    if inscricao.usuario_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acesso negado a esta parcela.")

    total_parcelas = len(pagamento.parcelas)

    link_duplicado = any(
        p.id != parcela.id and p.copia_cola_pix and p.copia_cola_pix == parcela.copia_cola_pix
        for p in pagamento.parcelas
    )
    if not parcela.copia_cola_pix or link_duplicado:
        order_nsu_parc = f"ORD-{inscricao.id}-PARC-{parcela.numero}"
        try:
            res = infinitepay_service.criar_checkout_link(
                order_nsu=order_nsu_parc,
                valor=parcela.valor,
                descricao=f"Inscrição Evento #{inscricao.evento_id} - Parcela {parcela.numero}/{total_parcelas}",
                customer_email=inscricao.usuario.email,
                customer_name=inscricao.usuario.nome,
                redirect_url="https://inscricoessinodalpb.netlify.app/usuario/dashboard.html"
            )
            parcela.copia_cola_pix = res.get("checkout_url")
        except Exception:
            val_fmt = f"{float(parcela.valor):.2f}".replace(".", ",")
            parcela.copia_cola_pix = f"https://pay.infinitepay.io/{infinitepay_service.handle}/{val_fmt}?order_nsu={order_nsu_parc}"

        from app.services.pix import gerar_qr_code_base64
        parcela.qr_code_pix = gerar_qr_code_base64(parcela.copia_cola_pix)
        db.commit()
        db.refresh(parcela)

    pdf_bytes = gerar_pdf_parcela(
        parcela_id=parcela.id,
        numero_parcela=parcela.numero,
        total_parcelas=total_parcelas,
        vencimento=parcela.vencimento,
        valor=parcela.valor,
        status=parcela.status,
        nome_participante=inscricao.usuario.nome,
        cpf_participante=inscricao.usuario.cpf,
        nome_evento=inscricao.evento.titulo,
        copia_cola_pix=parcela.copia_cola_pix,
        customer_email=inscricao.usuario.email
    )

    filename = f"parcela_{parcela.numero}_inscricao_{inscricao.id}.pdf"
    headers = {
        "Content-Disposition": f"inline; filename={filename}"
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


@router.get("/triagem/{triagem_id}/parcela/{numero_parcela}/pdf")
def baixar_pdf_parcela_triagem(
    triagem_id: int,
    numero_parcela: int = 1,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(obter_usuario_por_token_ou_query)
):
    triagem = db.query(InscricaoTriagem).filter(InscricaoTriagem.id == triagem_id).first()
    if not triagem:
        raise HTTPException(status_code=404, detail="Triagem de inscrição não encontrada.")

    if triagem.usuario_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acesso negado a esta triagem.")

    evento = triagem.evento
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    if evento.valor is not None and triagem.status == "PENDENTE_PAGAMENTO" and triagem.valor_total != evento.valor:
        triagem.valor_total = evento.valor
        db.commit()
        db.refresh(triagem)

    dt_primeira = triagem.data_primeira_parcela or get_hoje_brasil()
    if dt_primeira < get_hoje_brasil():
        dt_primeira = get_hoje_brasil()

    dt_limite = evento.data_inicio.date() if evento.data_inicio else dt_primeira
    max_permitido = calcular_max_parcelas(dt_primeira, dt_limite)
    n_parcelas = min(max(triagem.num_parcelas or 1, 1), max(max_permitido, 1))

    parcelas_calc = gerar_parcelas(
        valor_total=triagem.valor_total,
        num_parcelas=n_parcelas,
        data_primeira_parcela=dt_primeira,
        data_limite_evento=dt_limite
    )

    num_p = min(max(numero_parcela, 1), n_parcelas)
    item_p = parcelas_calc[num_p - 1]

    order_nsu_parc = f"TRIAGEM-{triagem.id}-PARC-{num_p}"
    try:
        res = infinitepay_service.criar_checkout_link(
            order_nsu=order_nsu_parc,
            valor=item_p["valor"],
            descricao=f"Inscrição Evento #{evento.id} - Parcela {num_p}/{n_parcelas}",
            customer_email=current_user.email,
            customer_name=current_user.nome
        )
        link_ou_pix = res.get("checkout_url")
    except Exception:
        val_fmt = f"{float(item_p['valor']):.2f}".replace(".", ",")
        link_ou_pix = f"https://pay.infinitepay.io/{infinitepay_service.handle}/{val_fmt}?order_nsu={order_nsu_parc}"

    pdf_bytes = gerar_pdf_parcela(
        parcela_id=triagem.id,
        numero_parcela=num_p,
        total_parcelas=n_parcelas,
        vencimento=item_p["vencimento"],
        valor=item_p["valor"],
        status="PENDENTE",
        nome_participante=current_user.nome,
        cpf_participante=current_user.cpf,
        nome_evento=evento.titulo,
        copia_cola_pix=link_ou_pix
    )

    filename = f"boleto_parcela_{num_p}_triagem_{triagem.id}.pdf"
    headers = {
        "Content-Disposition": f"inline; filename={filename}"
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


class ConfirmarCheckoutSchema(BaseModel):
    order_nsu: Optional[str] = None
    transaction_nsu: Optional[str] = None
    slug: Optional[str] = None
    receipt_url: Optional[str] = None
    capture_method: Optional[str] = None
    status: Optional[str] = None


@router.post("/confirmar-retorno-checkout")
def confirmar_retorno_checkout(
    payload: ConfirmarCheckoutSchema,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Recebe os dados de retorno do checkout da InfinitePay via frontend
    (quando o participante é redirecionado de volta para a dashboard ou página de confirmação).
    Verifica e confirma automaticamente a baixa do pagamento ou da parcela correspondente.
    """
    order_nsu_str = str(payload.order_nsu or "").strip()
    transaction_nsu = payload.transaction_nsu
    invoice_slug = payload.slug
    receipt_url = payload.receipt_url
    capture_method = payload.capture_method or ""
    
    logger.warning(
        f"Confirmar Retorno Checkout recebido: order_nsu={order_nsu_str}, "
        f"transaction_nsu={transaction_nsu}, slug={invoice_slug}, receipt={receipt_url}"
    )

    if not order_nsu_str and not transaction_nsu and not invoice_slug:
        raise HTTPException(status_code=400, detail="Parâmetros de confirmação ausentes.")

    # 1. Validação Antifraude e Verificação na InfinitePay:
    # Se transaction_nsu ou slug forem fornecidos (retorno legítimo do checkout), consulta a API da InfinitePay
    if transaction_nsu and (invoice_slug or order_nsu_str):
        res_check = infinitepay_service.consultar_status_pagamento(
            order_nsu=order_nsu_str,
            transaction_nsu=transaction_nsu,
            slug=invoice_slug
        )
        if res_check and res_check.get("paid") is False:
            logger.warning(f"Confirmação rejeitada pela InfinitePay (não pago): {res_check}")
            return {
                "success": False,
                "message": "A InfinitePay informou que este pagamento ainda não foi aprovado ou concluído."
            }
    elif not transaction_nsu and not invoice_slug:
        # Se não há comprovante/NSU da operadora (ex: clique manual no botão "Já paguei" sem retorno do checkout),
        # verifica apenas se a parcela já foi confirmada anteriormente via Webhook no banco.
        # NUNCA dar baixa automática sem validação da operadora!
        parc = None
        if order_nsu_str.startswith("ORD-") and "-PARC-" in order_nsu_str:
            parts = order_nsu_str.split("-")
            parc = db.query(Parcela).join(Pagamento).filter(
                Pagamento.inscricao_id == int(parts[1]),
                Parcela.numero == int(parts[3])
            ).first()
        elif order_nsu_str.startswith("PARCELA-") or order_nsu_str.startswith("PARC-"):
            clean_str = order_nsu_str.replace("PARCELA-", "").replace("PARC-", "").split("-")[0]
            parc = db.query(Parcela).filter(Parcela.id == int(clean_str)).first()

        if parc and parc.status == "PAGO":
            return {"success": True, "message": f"A parcela #{parc.numero} já consta como PAGA no sistema!", "status": "PAGO"}

        return {
            "success": False,
            "message": "O pagamento ainda não foi identificado pela operadora. A baixa ocorre automaticamente via webhook assim que o pagamento é compensado. Se você acabou de pagar, aguarde 1 a 2 minutos e atualize a página."
        }

    # Helper para dar baixa em parcela após validação
    def dar_baixa_parcela(parc_alvo: Parcela):
        if parc_alvo.status == "PAGO":
            return {"success": True, "message": "Parcela já constava como paga.", "status": "PAGO", "parcela_id": parc_alvo.id}

        parc_alvo.status = "PAGO"
        db.flush()
        pag = parc_alvo.pagamento
        if pag:
            total_pago = sum(
                (p.valor for p in pag.parcelas if p.status == "PAGO"),
                Decimal("0.00")
            )
            pag.paid_amount = total_pago
            if capture_method:
                pag.capture_method = capture_method
            if transaction_nsu and not pag.transaction_nsu:
                pag.transaction_nsu = str(transaction_nsu)
            if receipt_url and not pag.receipt_url:
                pag.receipt_url = str(receipt_url)
            if invoice_slug and not pag.invoice_slug:
                pag.invoice_slug = str(invoice_slug)
            
            todas_pagas = all(p.status == "PAGO" for p in pag.parcelas)
            if todas_pagas:
                status_ant = pag.status
                pag.status = "PAGO"
                if pag.inscricao:
                    pag.inscricao.status = "CONFIRMADA"
                db.commit()
                if status_ant != "PAGO" and background_tasks and pag.inscricao and pag.inscricao.usuario:
                    background_tasks.add_task(
                        enviar_email_confirmacao,
                        destinatario_email=pag.inscricao.usuario.email,
                        destinatario_nome=pag.inscricao.usuario.nome,
                        nome_evento=pag.inscricao.evento.titulo
                    )
            else:
                db.commit()
        else:
            db.commit()
        return {"success": True, "message": f"Parcela #{parc_alvo.numero} confirmada como PAGA!", "status": "PAGO", "parcela_id": parc_alvo.id}

    # 1. Parcela direta: PARCELA-{id} ou PARC-{id}
    if order_nsu_str.startswith("PARCELA-") or order_nsu_str.startswith("PARC-"):
        try:
            clean_str = order_nsu_str.replace("PARCELA-", "").replace("PARC-", "").split("-")[0]
            parc_id = int(clean_str)
            parc = db.query(Parcela).filter(Parcela.id == parc_id).first()
            if parc:
                return dar_baixa_parcela(parc)
        except Exception as e:
            logger.error(f"Erro ao buscar parcela por ID: {e}")

    # 2. Parcela por inscrição: ORD-{inscricao_id}-PARC-{numero}
    if order_nsu_str.startswith("ORD-") and "-PARC-" in order_nsu_str:
        try:
            parts = order_nsu_str.split("-")
            inscricao_id = int(parts[1])
            parcela_num = int(parts[3])
            parc = db.query(Parcela).join(Pagamento).filter(
                Pagamento.inscricao_id == inscricao_id,
                Parcela.numero == parcela_num
            ).first()
            if parc:
                return dar_baixa_parcela(parc)
        except Exception as e:
            logger.error(f"Erro ao buscar parcela ORD-PARC: {e}")

    # 3. Parcela por Triagem: TRIAGEM-{triagem_id}-PARC-{numero}
    if order_nsu_str.startswith("TRIAGEM-") and "-PARC-" in order_nsu_str:
        try:
            parts = order_nsu_str.split("-")
            triagem_id = int(parts[1])
            parcela_num = int(parts[3])

            from app.services.triagem_service import converter_triagem_em_inscricao
            triagem = db.query(InscricaoTriagem).filter(InscricaoTriagem.id == triagem_id).first()
            if triagem:
                if triagem.status == "CONVERTIDA":
                    inscricao = db.query(Inscricao).filter(
                        Inscricao.usuario_id == triagem.usuario_id,
                        Inscricao.evento_id == triagem.evento_id,
                        Inscricao.status != "CANCELADA"
                    ).order_by(Inscricao.created_at.desc()).first()
                    if inscricao:
                        parc = db.query(Parcela).join(Pagamento).filter(
                            Pagamento.inscricao_id == inscricao.id,
                            Parcela.numero == parcela_num
                        ).first()
                        if parc:
                            return dar_baixa_parcela(parc)
                else:
                    converter_triagem_em_inscricao(
                        db=db,
                        triagem=triagem,
                        order_nsu=order_nsu_str,
                        transaction_nsu=str(transaction_nsu or ""),
                        receipt_url=str(receipt_url or ""),
                        invoice_slug=str(invoice_slug or ""),
                        paid_amount=triagem.valor_total,
                        capture_method=capture_method,
                        parcela_num_paga=parcela_num,
                        background_tasks=background_tasks
                    )
                    return {"success": True, "message": "Triagem convertida e parcela 1 confirmada!", "status": "CONFIRMADA"}
        except Exception as e:
            logger.error(f"Erro ao processar triagem parcela: {e}")

    # 4. Triagem à vista: TRIAGEM-{triagem_id}
    if order_nsu_str.startswith("TRIAGEM-"):
        try:
            parts = order_nsu_str.split("-")
            triagem_id = int(parts[1])
            from app.services.triagem_service import converter_triagem_em_inscricao
            triagem = db.query(InscricaoTriagem).filter(InscricaoTriagem.id == triagem_id).first()
            if triagem and triagem.status != "CONVERTIDA":
                converter_triagem_em_inscricao(
                    db=db,
                    triagem=triagem,
                    order_nsu=order_nsu_str,
                    transaction_nsu=str(transaction_nsu or ""),
                    receipt_url=str(receipt_url or ""),
                    invoice_slug=str(invoice_slug or ""),
                    paid_amount=triagem.valor_total,
                    capture_method=capture_method,
                    parcela_num_paga=1,
                    background_tasks=background_tasks
                )
                return {"success": True, "message": "Inscrição à vista confirmada com sucesso!", "status": "CONFIRMADA"}
        except Exception as e:
            logger.error(f"Erro ao processar triagem à vista: {e}")

    # 5. Diária: DIARIA_TRIAGEM-{triagem_id}
    if order_nsu_str.startswith("DIARIA_TRIAGEM-"):
        try:
            parts = order_nsu_str.split("-")
            triagem_id = int(parts[1])
            from app.models.diaria import DiariaTriagem
            from app.services.diaria_service import converter_triagem_em_diaria
            triagem = db.query(DiariaTriagem).filter(DiariaTriagem.id == triagem_id).first()
            if triagem and triagem.status != "CONVERTIDA":
                converter_triagem_em_diaria(
                    db=db,
                    triagem=triagem,
                    order_nsu=order_nsu_str,
                    transaction_nsu=str(transaction_nsu or ""),
                    receipt_url=str(receipt_url or ""),
                    invoice_slug=str(invoice_slug or ""),
                    paid_amount=triagem.valor_total,
                    capture_method=capture_method,
                    background_tasks=background_tasks
                )
                return {"success": True, "message": "Diária confirmada com sucesso!", "status": "CONFIRMADA"}
        except Exception as e:
            logger.error(f"Erro ao processar diária: {e}")

    # 6. Pagamento à vista: ORD-{inscricao_id}
    if order_nsu_str.startswith("ORD-"):
        try:
            inscricao_id = int(order_nsu_str.replace("ORD-", ""))
            pagamento = db.query(Pagamento).filter(Pagamento.inscricao_id == inscricao_id).first()
            if pagamento:
                pagamento.status = "PAGO"
                pagamento.paid_amount = pagamento.valor
                if transaction_nsu:
                    pagamento.transaction_nsu = str(transaction_nsu)
                if receipt_url:
                    pagamento.receipt_url = str(receipt_url)
                if invoice_slug:
                    pagamento.invoice_slug = str(invoice_slug)
                if pagamento.inscricao:
                    status_ant = pagamento.inscricao.status
                    pagamento.inscricao.status = "CONFIRMADA"
                    db.commit()
                    if status_ant != "CONFIRMADA" and background_tasks and pagamento.inscricao.usuario:
                        background_tasks.add_task(
                            enviar_email_confirmacao,
                            destinatario_email=pagamento.inscricao.usuario.email,
                            destinatario_nome=pagamento.inscricao.usuario.nome,
                            nome_evento=pagamento.inscricao.evento.titulo
                        )
                else:
                    db.commit()
                return {"success": True, "message": "Pagamento confirmado com sucesso!", "status": "PAGO"}
        except Exception as e:
            logger.error(f"Erro ao processar ORD direto: {e}")

    # 7. Buscar por transaction_nsu ou invoice_slug existente
    if transaction_nsu or invoice_slug:
        pagamento = db.query(Pagamento).filter(
            (Pagamento.transaction_nsu == transaction_nsu) | (Pagamento.invoice_slug == invoice_slug)
        ).first()
        if pagamento:
            if pagamento.forma_pagamento == "PARCELADO":
                # NUNCA dar baixa geral em carnê por correspondência de NSU de uma parcela
                parc_alvo = None
                for p in pagamento.parcelas:
                    if (order_nsu_str and f"-PARC-{p.numero}" in order_nsu_str) or (p.copia_cola_pix and order_nsu_str and order_nsu_str in p.copia_cola_pix):
                        parc_alvo = p
                        break
                if not parc_alvo:
                    parc_alvo = next((p for p in pagamento.parcelas if p.status == "PENDENTE"), None)
                if parc_alvo:
                    return dar_baixa_parcela(parc_alvo)
                else:
                    return {"success": True, "message": "Todas as parcelas do carnê já constam como pagas.", "status": "PAGO"}
            else:
                pagamento.status = "PAGO"
                for p in pagamento.parcelas:
                    p.status = "PAGO"
                pagamento.paid_amount = pagamento.valor
                if pagamento.inscricao:
                    pagamento.inscricao.status = "CONFIRMADA"
                db.commit()
                return {"success": True, "message": "Pagamento localizado e confirmado com sucesso!", "status": "PAGO"}

    return {"success": False, "message": "Não foi possível vincular o retorno da InfinitePay a um pedido específico."}


