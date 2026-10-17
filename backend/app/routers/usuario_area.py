from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, Any, List
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user, verify_password, get_password_hash
from app.models.usuario import Usuario
from app.models.inscricao import Inscricao
from app.models.pagamento import Pagamento
from app.models.parcela import Parcela

router = APIRouter(prefix="/usuario", tags=["Área do Participante"])


@router.get("/dashboard")
def obter_dashboard_usuario(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Retorna todos os dados para alimentar o Dashboard da Área do Participante:
    - Dados Pessoais
    - Última Inscrição e Detalhes do Evento
    - Lista de Parcelas e Pagamentos com links/Pix
    - Status geral e Comunicados
    """
    # 1. Dados Pessoais
    usuario_info = {
        "id": current_user.id,
        "nome": current_user.nome,
        "email": current_user.email,
        "cpf": current_user.cpf,
        "telefone": current_user.telefone,
        "is_admin": current_user.is_admin,
        "created_at": current_user.created_at.isoformat()
    }

    # 2. Inscrições do Usuário
    inscricoes = db.query(Inscricao).filter(Inscricao.usuario_id == current_user.id).order_by(Inscricao.created_at.desc()).all()

    inscricoes_data = []
    pagamentos_data = []

    for ins in inscricoes:
        first_pag = ins.pagamentos[0] if ins.pagamentos else None
        ins_dict = {
            "id": ins.id,
            "tipo_registro": "REGULAR",
            "evento_id": ins.evento_id,
            "evento_titulo": ins.evento.titulo if ins.evento else "",
            "evento_local": ins.evento.local if ins.evento else "",
            "evento_data_inicio": ins.evento.data_inicio.isoformat() if ins.evento else "",
            "evento_data_fim": ins.evento.data_fim.isoformat() if ins.evento else "",
            "status": ins.status,
            "forma_pagamento": ins.forma_pagamento,
            "capture_method": first_pag.capture_method if first_pag else None,
            "valor_total": float(ins.valor_total),
            "dados_extras": ins.dados_extras,
            "codigo_checkin": ins.codigo_checkin,
            "checkin_realizado": ins.checkin_realizado,
            "checkin_data": ins.checkin_data.isoformat() if ins.checkin_data else None,
            "created_at": ins.created_at.isoformat()
        }
        inscricoes_data.append(ins_dict)

        # Buscar pagamentos associados
        from app.services.parcelamento import get_hoje_brasil
        hoje = get_hoje_brasil()
        
        for pag in ins.pagamentos:
            pag_status = "CANCELADO" if ins.status == "CANCELADA" else pag.status
            parcelas_list = []
            for parc in pag.parcelas:
                parc_status = "CANCELADO" if ins.status == "CANCELADA" else parc.status
                if parc_status == "PENDENTE" and parc.vencimento < hoje:
                    parc_status = "VENCIDO"
                parcelas_list.append({
                    "id": parc.id,
                    "numero": parc.numero,
                    "vencimento": parc.vencimento.isoformat() if parc.vencimento else "",
                    "valor": float(parc.valor),
                    "status": parc_status,
                    "copia_cola_pix": parc.copia_cola_pix,
                    "qr_code_pix": parc.qr_code_pix,
                    "pdf_url": f"/api/v1/pagamentos/parcelas/{parc.id}/pdf"
                })

            if pag_status == "PENDENTE":
                if any(p["status"] == "VENCIDO" for p in parcelas_list) or (pag.forma_pagamento in ["PIX", "INFINITEPAY"] and len(pag.parcelas) > 0 and pag.parcelas[0].vencimento < hoje):
                    pag_status = "VENCIDO"

            pagamentos_data.append({
                "id": pag.id,
                "inscricao_id": ins.id,
                "evento_titulo": ins.evento.titulo if ins.evento else "",
                "forma_pagamento": pag.forma_pagamento,
                "capture_method": pag.capture_method,
                "valor": float(pag.valor),
                "status": pag_status,
                "copia_cola_pix": pag.copia_cola_pix,
                "qr_code_pix": pag.qr_code_pix,
                "receipt_url": pag.receipt_url,
                "parcelas": parcelas_list
            })

    # 2.1 Diárias Confirmadas do Usuário
    from app.models.diaria import InscricaoDiaria, DiariaTriagem
    diarias = db.query(InscricaoDiaria).filter(InscricaoDiaria.usuario_id == current_user.id).order_by(InscricaoDiaria.created_at.desc()).all()

    for dia in diarias:
        dias_str = ", ".join(dia.dias_selecionados) if isinstance(dia.dias_selecionados, list) else str(dia.dias_selecionados)
        dia_dict = {
            "id": dia.id,
            "tipo_registro": "DIARIA",
            "dias_selecionados": dia.dias_selecionados,
            "dias_formatados": dias_str,
            "quantidade_dias": dia.quantidade_dias,
            "evento_id": dia.evento_id,
            "evento_titulo": dia.evento.titulo if dia.evento else "",
            "evento_local": dia.evento.local if dia.evento else "",
            "evento_data_inicio": dia.evento.data_inicio.isoformat() if dia.evento else "",
            "evento_data_fim": dia.evento.data_fim.isoformat() if dia.evento else "",
            "status": dia.status,
            "forma_pagamento": dia.forma_pagamento or "Cartão / Pix (InfinitePay)",
            "capture_method": dia.capture_method,
            "valor_total": float(dia.valor_total),
            "dados_extras": dia.dados_extras,
            "codigo_checkin": dia.codigo_checkin,
            "checkin_realizado": dia.checkin_realizado,
            "checkin_data": dia.checkin_data.isoformat() if dia.checkin_data else None,
            "receipt_url": dia.receipt_url,
            "created_at": dia.created_at.isoformat()
        }
        inscricoes_data.append(dia_dict)

    # 3. Triagens Pendentes do Usuário
    from app.models.inscricao_triagem import InscricaoTriagem
    triagens = db.query(InscricaoTriagem).filter(
        InscricaoTriagem.usuario_id == current_user.id,
        InscricaoTriagem.status == "PENDENTE_PAGAMENTO"
    ).order_by(InscricaoTriagem.created_at.desc()).all()

    triagens_data = []
    for tr in triagens:
        triagens_data.append({
            "id": tr.id,
            "tipo_registro": "REGULAR",
            "evento_id": tr.evento_id,
            "evento_titulo": tr.evento.titulo if tr.evento else "",
            "evento_local": tr.evento.local if tr.evento else "",
            "evento_data_inicio": tr.evento.data_inicio.isoformat() if tr.evento and tr.evento.data_inicio else "",
            "evento_data_fim": tr.evento.data_fim.isoformat() if tr.evento and tr.evento.data_fim else "",
            "status": tr.status,
            "forma_pagamento": tr.forma_pagamento,
            "num_parcelas": tr.num_parcelas,
            "data_primeira_parcela": tr.data_primeira_parcela.isoformat() if tr.data_primeira_parcela else None,
            "valor_total": float(tr.valor_total),
            "created_at": tr.created_at.isoformat()
        })

    # 3.1 Triagens de Diária Pendentes do Usuário
    triagens_diarias = db.query(DiariaTriagem).filter(
        DiariaTriagem.usuario_id == current_user.id,
        DiariaTriagem.status == "PENDENTE_PAGAMENTO"
    ).order_by(DiariaTriagem.created_at.desc()).all()

    from app.services.infinitepay import infinitepay_service
    for td in triagens_diarias:
        order_nsu = f"DIARIA_TRIAGEM-{td.id}"
        chk = infinitepay_service.criar_checkout_link(
            order_nsu=order_nsu,
            valor=td.valor_total,
            descricao=f"Diária ({td.quantidade_dias}d) - {td.evento.titulo if td.evento else 'Evento'}",
            customer_email=current_user.email,
            customer_name=current_user.nome
        )
        dias_str = ", ".join(td.dias_selecionados) if isinstance(td.dias_selecionados, list) else str(td.dias_selecionados)
        triagens_data.append({
            "id": td.id,
            "tipo_registro": "DIARIA",
            "evento_id": td.evento_id,
            "evento_titulo": td.evento.titulo if td.evento else "",
            "evento_local": td.evento.local if td.evento else "",
            "evento_data_inicio": td.evento.data_inicio.isoformat() if td.evento and td.evento.data_inicio else "",
            "evento_data_fim": td.evento.data_fim.isoformat() if td.evento and td.evento.data_fim else "",
            "dias_formatados": dias_str,
            "dias_selecionados": td.dias_selecionados,
            "status": td.status,
            "forma_pagamento": td.forma_pagamento,
            "num_parcelas": 1,
            "valor_total": float(td.valor_total),
            "checkout_url": chk.get("checkout_url"),
            "created_at": td.created_at.isoformat()
        })

    # Comunicados do sistema/evento
    comunicados = [
        {
            "id": 1,
            "titulo": "Bem-vindo à Plataforma de Eventos!",
            "mensagem": "Verifique seus dados de inscrição e mantenha suas parcelas em dia para garantir seu credenciamento.",
            "data": current_user.created_at.strftime("%d/%m/%Y")
        }
    ]

    return {
        "usuario": usuario_info,
        "inscricoes": inscricoes_data,
        "pagamentos": pagamentos_data,
        "triagens": triagens_data,
        "comunicados": comunicados
    }


from app.schemas.usuario import UsuarioUpdate

@router.put("/perfil")
def atualizar_perfil(
    req: UsuarioUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Atualiza as informações cadastrais do participante logado.
    """
    if req.email and req.email != current_user.email:
        existente = db.query(Usuario).filter(Usuario.email == req.email).first()
        if existente:
            raise HTTPException(status_code=400, detail="Este e-mail já está sendo utilizado por outro participante.")
            
    if req.cpf and req.cpf != current_user.cpf:
        existente_cpf = db.query(Usuario).filter(Usuario.cpf == req.cpf).first()
        if existente_cpf:
            raise HTTPException(status_code=400, detail="Este CPF já está cadastrado para outro participante.")
            
    if req.nome:
        current_user.nome = req.nome
    if req.email:
        current_user.email = req.email
    if req.cpf:
        current_user.cpf = req.cpf
    if req.telefone:
        current_user.telefone = req.telefone
    if req.senha:
        from app.core.security import get_password_hash
        current_user.senha_hash = get_password_hash(req.senha)
        
    db.commit()
    return {"message": "Perfil atualizado com sucesso!"}


class AlterarSenhaRequest(BaseModel):
    senha_atual: str
    nova_senha: str


@router.post("/alterar-senha")
def alterar_senha(
    req: AlterarSenhaRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Altera a senha do participante logado mediante validação da senha atual.
    """
    if not verify_password(req.senha_atual, current_user.senha_hash):
        raise HTTPException(status_code=400, detail="A senha atual informada está incorreta.")
    
    current_user.senha_hash = get_password_hash(req.nova_senha)
    db.commit()
    return {"message": "Senha alterada com sucesso!"}
