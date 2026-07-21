from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, Any, List

from app.core.database import get_db
from app.core.security import get_current_user
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
        ins_dict = {
            "id": ins.id,
            "evento_id": ins.evento_id,
            "evento_titulo": ins.evento.titulo if ins.evento else "",
            "evento_local": ins.evento.local if ins.evento else "",
            "evento_data_inicio": ins.evento.data_inicio.isoformat() if ins.evento else "",
            "evento_data_fim": ins.evento.data_fim.isoformat() if ins.evento else "",
            "status": ins.status,
            "forma_pagamento": ins.forma_pagamento,
            "valor_total": float(ins.valor_total),
            "dados_extras": ins.dados_extras,
            "created_at": ins.created_at.isoformat()
        }
        inscricoes_data.append(ins_dict)

        # Buscar pagamentos associados
        for pag in ins.pagamentos:
            parcelas_list = []
            for parc in pag.parcelas:
                parcelas_list.append({
                    "id": parc.id,
                    "numero": parc.numero,
                    "vencimento": parc.vencimento.isoformat() if parc.vencimento else "",
                    "valor": float(parc.valor),
                    "status": parc.status,
                    "copia_cola_pix": parc.copia_cola_pix,
                    "qr_code_pix": parc.qr_code_pix,
                    "pdf_url": f"/api/v1/pagamentos/parcelas/{parc.id}/pdf"
                })

            pagamentos_data.append({
                "id": pag.id,
                "inscricao_id": ins.id,
                "evento_titulo": ins.evento.titulo if ins.evento else "",
                "forma_pagamento": pag.forma_pagamento,
                "valor": float(pag.valor),
                "status": pag.status,
                "copia_cola_pix": pag.copia_cola_pix,
                "qr_code_pix": pag.qr_code_pix,
                "receipt_url": pag.receipt_url,
                "parcelas": parcelas_list
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
        "comunicados": comunicados
    }
