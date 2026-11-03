from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text
from typing import List, Optional
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.security import require_permissao
from app.models.usuario import Usuario
from app.models.configuracao import Configuracao
from app.models.cantina import (
    CantinaCaixa,
    CantinaCaixaMovimentacao,
    CantinaProduto,
    CantinaVenda,
    CantinaVendaItem
)
from app.schemas.cantina import (
    CantinaCaixaAbrir,
    CantinaCaixaFechar,
    CantinaMovimentacaoCreate,
    CantinaProdutoCreate,
    CantinaProdutoUpdate,
    CantinaProdutoResponse,
    CantinaEstoqueAjuste,
    CantinaVendaCreate,
    CantinaVendaResponse,
    CantinaConfigUpdate
)

router = APIRouter(prefix="/admin/cantina", tags=["Cantina & PDV"])

CHAVE_TAXA_CARTAO = "cantina_taxa_maquina_cartao"
CHAVE_MODO_TAXA = "cantina_modo_calculo_taxa"
_TABELAS_VERIFICADAS = False


def _garantir_tabelas_cantina():
    global _TABELAS_VERIFICADAS
    if _TABELAS_VERIFICADAS:
        return
    try:
        from app.core.database import engine, Base
        Base.metadata.create_all(
            bind=engine,
            tables=[
                CantinaCaixa.__table__,
                CantinaCaixaMovimentacao.__table__,
                CantinaProduto.__table__,
                CantinaVenda.__table__,
                CantinaVendaItem.__table__
            ]
        )
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE cantina_vendas ADD COLUMN IF NOT EXISTS caixa_id INTEGER REFERENCES cantina_caixas(id) ON DELETE SET NULL;"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cantina_vendas_caixa ON cantina_vendas(caixa_id);"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cantina_mov_caixa ON cantina_caixa_movimentacoes(caixa_id);"))
            conn.commit()
        _TABELAS_VERIFICADAS = True
    except Exception:
        pass


def _obter_config_cantina_db(db: Session) -> dict:
    _garantir_tabelas_cantina()
    cfg_taxa = db.query(Configuracao).filter(Configuracao.chave == CHAVE_TAXA_CARTAO).first()
    cfg_modo = db.query(Configuracao).filter(Configuracao.chave == CHAVE_MODO_TAXA).first()

    taxa = Decimal("0.00")
    if cfg_taxa and cfg_taxa.valor:
        try:
            taxa = Decimal(str(cfg_taxa.valor).replace(",", "."))
        except Exception:
            taxa = Decimal("0.00")

    modo = (cfg_modo.valor if cfg_modo and cfg_modo.valor else "REPASSE").upper().strip()
    if modo not in ("REPASSE", "ACRESCIMO"):
        modo = "REPASSE"

    return {
        "taxa_maquina_cartao": float(taxa),
        "modo_calculo_taxa": modo
    }


def _calcular_valor_maquina(subtotal: Decimal, taxa_pct: Decimal, modo: str = "REPASSE") -> tuple[Decimal, Decimal]:
    if taxa_pct <= Decimal("0") or subtotal <= Decimal("0"):
        return subtotal.quantize(Decimal("0.01")), Decimal("0.00")

    if modo == "ACRESCIMO":
        total_cobrado = (subtotal * (Decimal("1") + (taxa_pct / Decimal("100")))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    else:
        # REPASSE por dentro: garante que descontando taxa_pct% na máquina sobra exatamente o subtotal
        divisor = Decimal("1") - (taxa_pct / Decimal("100"))
        if divisor <= Decimal("0.01"):
            divisor = Decimal("0.01")
        total_cobrado = (subtotal / divisor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    valor_taxa = (total_cobrado - subtotal).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return total_cobrado, valor_taxa


def _calcular_resumo_caixa(caixa: CantinaCaixa, vendas: List[CantinaVenda], movimentacoes: List[CantinaCaixaMovimentacao]) -> dict:
    vendas_concluidas = [v for v in vendas if v.status == "CONCLUIDA"]
    vendas_canceladas = [v for v in vendas if v.status == "CANCELADA"]

    valor_inicial = float(caixa.valor_inicial or 0)
    vendas_dinheiro = sum(float(v.valor_subtotal or 0) for v in vendas_concluidas if (v.forma_pagamento or "").upper() == "DINHEIRO")
    vendas_pix = sum(float(v.valor_subtotal or 0) for v in vendas_concluidas if (v.forma_pagamento or "").upper() == "PIX")
    vendas_cartao_liquido = sum(float(v.valor_subtotal or 0) for v in vendas_concluidas if (v.forma_pagamento or "").upper() == "CARTAO")
    vendas_cartao_cobrado = sum(float(v.valor_total_cobrado or 0) for v in vendas_concluidas if (v.forma_pagamento or "").upper() == "CARTAO")
    taxas_cartao = sum(float(v.valor_taxa_cartao or 0) for v in vendas_concluidas if (v.forma_pagamento or "").upper() == "CARTAO")

    custo_itens_vendidos = sum(float(v.valor_custo_total or 0) for v in vendas_concluidas)
    receita_liquida_total = vendas_dinheiro + vendas_pix + vendas_cartao_liquido
    receita_total_cobrada = vendas_dinheiro + vendas_pix + vendas_cartao_cobrado
    lucro_bruto_caixa = receita_liquida_total - custo_itens_vendidos

    total_suprimentos = sum(float(m.valor or 0) for m in movimentacoes if (m.tipo or "").upper() == "SUPRIMENTO")
    total_sangrias = sum(float(m.valor or 0) for m in movimentacoes if (m.tipo or "").upper() == "SANGRIA")
    saldo_dinheiro_gaveta = round(valor_inicial + vendas_dinheiro + total_suprimentos - total_sangrias, 2)

    valor_fechamento_info = float(caixa.valor_fechamento_informado) if caixa.valor_fechamento_informado is not None else None
    diferenca_fechamento = (
        round(valor_fechamento_info - saldo_dinheiro_gaveta, 2)
        if valor_fechamento_info is not None else None
    )

    movs_ordenadas = sorted(
        movimentacoes,
        key=lambda x: x.created_at or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True
    )

    return {
        "id": caixa.id,
        "data_referencia": caixa.data_referencia,
        "descricao": caixa.descricao or f"Caixa #{caixa.id}",
        "valor_inicial": round(valor_inicial, 2),
        "valor_fechamento_informado": round(valor_fechamento_info, 2) if valor_fechamento_info is not None else None,
        "diferenca_fechamento": diferenca_fechamento,
        "observacao_abertura": caixa.observacao_abertura,
        "observacao_fechamento": caixa.observacao_fechamento,
        "status": caixa.status,
        "aberto_por_id": caixa.aberto_por_id,
        "aberto_por_nome": caixa.aberto_por_nome,
        "fechado_por_id": caixa.fechado_por_id,
        "fechado_por_nome": caixa.fechado_por_nome,
        "opened_at": caixa.opened_at.isoformat() if caixa.opened_at else None,
        "closed_at": caixa.closed_at.isoformat() if caixa.closed_at else None,
        "total_pedidos": len(vendas_concluidas),
        "total_cancelados": len(vendas_canceladas),
        "vendas_dinheiro": round(vendas_dinheiro, 2),
        "vendas_pix": round(vendas_pix, 2),
        "vendas_cartao_liquido": round(vendas_cartao_liquido, 2),
        "vendas_cartao_cobrado": round(vendas_cartao_cobrado, 2),
        "taxas_cartao": round(taxas_cartao, 2),
        "custo_itens_vendidos": round(custo_itens_vendidos, 2),
        "receita_liquida_total": round(receita_liquida_total, 2),
        "receita_total_cobrada": round(receita_total_cobrada, 2),
        "lucro_bruto_caixa": round(lucro_bruto_caixa, 2),
        "total_suprimentos": round(total_suprimentos, 2),
        "total_sangrias": round(total_sangrias, 2),
        "saldo_dinheiro_gaveta": saldo_dinheiro_gaveta,
        "movimentacoes": [
            {
                "id": m.id,
                "caixa_id": m.caixa_id,
                "tipo": m.tipo,
                "valor": round(float(m.valor or 0), 2),
                "motivo": m.motivo,
                "operador_id": m.operador_id,
                "operador_nome": m.operador_nome,
                "created_at": m.created_at.isoformat() if m.created_at else None
            }
            for m in movs_ordenadas
        ]
    }


# --- Gestão de Caixas (Abertura, Fechamento e Movimentações de Gaveta) ---

@router.get("/caixas/atual")
def obter_caixa_atual_cantina(
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("cantina"))
):
    _garantir_tabelas_cantina()
    caixa = (
        db.query(CantinaCaixa)
        .options(joinedload(CantinaCaixa.movimentacoes))
        .filter(CantinaCaixa.status == "ABERTO")
        .order_by(CantinaCaixa.id.desc())
        .first()
    )
    if not caixa:
        return {"caixa_aberto": None}

    vendas = db.query(CantinaVenda).filter(CantinaVenda.caixa_id == caixa.id).all()
    return {"caixa_aberto": _calcular_resumo_caixa(caixa, vendas, caixa.movimentacoes or [])}


@router.get("/caixas")
def listar_caixas_cantina(
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("cantina"))
):
    _garantir_tabelas_cantina()
    caixas = (
        db.query(CantinaCaixa)
        .options(joinedload(CantinaCaixa.movimentacoes))
        .order_by(CantinaCaixa.id.desc())
        .all()
    )
    todas_vendas = db.query(CantinaVenda).all()
    vendas_por_caixa = {}
    for v in todas_vendas:
        if v.caixa_id:
            vendas_por_caixa.setdefault(v.caixa_id, []).append(v)

    resultado = [
        _calcular_resumo_caixa(cx, vendas_por_caixa.get(cx.id, []), cx.movimentacoes or [])
        for cx in caixas
    ]
    caixa_aberto = next((c for c in resultado if c["status"] == "ABERTO"), None)
    return {
        "caixa_aberto": caixa_aberto,
        "caixas": resultado
    }


@router.post("/caixas/abrir", status_code=status.HTTP_201_CREATED)
def abrir_caixa_cantina(
    req: CantinaCaixaAbrir,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("cantina"))
):
    _garantir_tabelas_cantina()
    existente = db.query(CantinaCaixa).filter(CantinaCaixa.status == "ABERTO").first()
    if existente:
        raise HTTPException(
            status_code=400,
            detail=f"Já existe um caixa aberto ({existente.descricao or '#' + str(existente.id)} - {existente.data_referencia}). Feche-o antes de abrir um novo caixa."
        )

    data_ref = req.data_referencia.strip()
    descricao = req.descricao.strip() if req.descricao and req.descricao.strip() else f"Caixa {data_ref}"

    novo_caixa = CantinaCaixa(
        data_referencia=data_ref,
        descricao=descricao,
        valor_inicial=Decimal(str(req.valor_inicial or 0)).quantize(Decimal("0.01")),
        observacao_abertura=req.observacao_abertura.strip() if req.observacao_abertura else None,
        status="ABERTO",
        aberto_por_id=admin.id,
        aberto_por_nome=admin.nome
    )
    db.add(novo_caixa)
    db.commit()
    db.refresh(novo_caixa)

    # Vincular eventuais vendas anteriores que estavam sem caixa_id se solicitado
    if req.vincular_vendas_sem_caixa:
        vendas_orfas = db.query(CantinaVenda).filter(CantinaVenda.caixa_id == None).all()
        if vendas_orfas:
            for vo in vendas_orfas:
                vo.caixa_id = novo_caixa.id
            db.commit()

    vendas = db.query(CantinaVenda).filter(CantinaVenda.caixa_id == novo_caixa.id).all()
    return {
        "sucesso": True,
        "mensagem": f"Caixa '{novo_caixa.descricao}' aberto com sucesso!",
        "caixa": _calcular_resumo_caixa(novo_caixa, vendas, [])
    }


@router.post("/caixas/{caixa_id}/fechar")
def fechar_caixa_cantina(
    caixa_id: int,
    req: CantinaCaixaFechar,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("cantina"))
):
    _garantir_tabelas_cantina()
    caixa = (
        db.query(CantinaCaixa)
        .options(joinedload(CantinaCaixa.movimentacoes))
        .filter(CantinaCaixa.id == caixa_id)
        .first()
    )
    if not caixa:
        raise HTTPException(status_code=404, detail="Caixa não encontrado.")
    if caixa.status == "FECHADO":
        raise HTTPException(status_code=400, detail="Este caixa já se encontra fechado.")

    caixa.status = "FECHADO"
    if req.valor_fechamento_informado is not None:
        caixa.valor_fechamento_informado = Decimal(str(req.valor_fechamento_informado)).quantize(Decimal("0.01"))
    caixa.observacao_fechamento = req.observacao_fechamento.strip() if req.observacao_fechamento else None
    caixa.fechado_por_id = admin.id
    caixa.fechado_por_nome = admin.nome
    caixa.closed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(caixa)

    vendas = db.query(CantinaVenda).filter(CantinaVenda.caixa_id == caixa.id).all()
    return {
        "sucesso": True,
        "mensagem": f"Caixa #{caixa.id} fechado com sucesso!",
        "caixa": _calcular_resumo_caixa(caixa, vendas, caixa.movimentacoes or [])
    }


@router.post("/caixas/{caixa_id}/reabrir")
def reabrir_caixa_cantina(
    caixa_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("cantina"))
):
    _garantir_tabelas_cantina()
    aberto = db.query(CantinaCaixa).filter(CantinaCaixa.status == "ABERTO").first()
    if aberto and aberto.id != caixa_id:
        raise HTTPException(
            status_code=400,
            detail=f"Não é possível reabrir este caixa pois o Caixa #{aberto.id} ({aberto.descricao}) está aberto no momento."
        )

    caixa = (
        db.query(CantinaCaixa)
        .options(joinedload(CantinaCaixa.movimentacoes))
        .filter(CantinaCaixa.id == caixa_id)
        .first()
    )
    if not caixa:
        raise HTTPException(status_code=404, detail="Caixa não encontrado.")

    caixa.status = "ABERTO"
    caixa.closed_at = None
    db.commit()
    db.refresh(caixa)

    vendas = db.query(CantinaVenda).filter(CantinaVenda.caixa_id == caixa.id).all()
    return {
        "sucesso": True,
        "mensagem": f"Caixa #{caixa.id} reaberto com sucesso!",
        "caixa": _calcular_resumo_caixa(caixa, vendas, caixa.movimentacoes or [])
    }


@router.post("/caixas/{caixa_id}/movimentacoes", status_code=status.HTTP_201_CREATED)
def registrar_movimentacao_caixa(
    caixa_id: int,
    req: CantinaMovimentacaoCreate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("cantina"))
):
    _garantir_tabelas_cantina()
    caixa = (
        db.query(CantinaCaixa)
        .options(joinedload(CantinaCaixa.movimentacoes))
        .filter(CantinaCaixa.id == caixa_id)
        .first()
    )
    if not caixa:
        raise HTTPException(status_code=404, detail="Caixa não encontrado.")
    if caixa.status != "ABERTO":
        raise HTTPException(status_code=400, detail="Só é permitido lançar movimentações em um caixa aberto.")

    tipo = (req.tipo or "").upper().strip()
    if tipo not in ("SUPRIMENTO", "SANGRIA"):
        raise HTTPException(status_code=400, detail="Tipo de movimentação inválido. Use SUPRIMENTO ou SANGRIA.")

    mov = CantinaCaixaMovimentacao(
        caixa_id=caixa.id,
        tipo=tipo,
        valor=Decimal(str(req.valor)).quantize(Decimal("0.01")),
        motivo=req.motivo.strip() if req.motivo else ("Entrada de troco / Suprimento" if tipo == "SUPRIMENTO" else "Retirada / Sangria"),
        operador_id=admin.id,
        operador_nome=admin.nome
    )
    db.add(mov)
    db.commit()
    db.refresh(caixa)

    vendas = db.query(CantinaVenda).filter(CantinaVenda.caixa_id == caixa.id).all()
    return {
        "sucesso": True,
        "mensagem": f"{'Suprimento' if tipo == 'SUPRIMENTO' else 'Sangria'} registrado com sucesso!",
        "caixa": _calcular_resumo_caixa(caixa, vendas, caixa.movimentacoes or [])
    }


@router.delete("/movimentacoes/{mov_id}")
def excluir_movimentacao_caixa(
    mov_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("cantina"))
):
    _garantir_tabelas_cantina()
    mov = db.query(CantinaCaixaMovimentacao).filter(CantinaCaixaMovimentacao.id == mov_id).first()
    if not mov:
        raise HTTPException(status_code=404, detail="Movimentação não encontrada.")

    caixa = db.query(CantinaCaixa).filter(CantinaCaixa.id == mov.caixa_id).first()
    if caixa and caixa.status != "ABERTO":
        raise HTTPException(status_code=400, detail="Não é possível remover movimentações de um caixa já fechado.")

    db.delete(mov)
    db.commit()
    return {"sucesso": True, "mensagem": "Movimentação removida com sucesso."}


# --- Configurações da Cantina (Taxa da Máquina) ---

@router.get("/config")
def obter_config_cantina(
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("cantina"))
):
    return _obter_config_cantina_db(db)


@router.put("/config")
def salvar_config_cantina(
    req: CantinaConfigUpdate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("cantina"))
):
    modo = (req.modo_calculo_taxa or "REPASSE").upper().strip()
    if modo not in ("REPASSE", "ACRESCIMO"):
        modo = "REPASSE"

    updates = {
        CHAVE_TAXA_CARTAO: str(req.taxa_maquina_cartao),
        CHAVE_MODO_TAXA: modo
    }
    for chave, valor in updates.items():
        cfg = db.query(Configuracao).filter(Configuracao.chave == chave).first()
        if not cfg:
            cfg = Configuracao(chave=chave, valor=valor)
            db.add(cfg)
        else:
            cfg.valor = valor

    db.commit()
    return {
        "sucesso": True,
        "mensagem": "Configuração da taxa de máquina salva com sucesso!",
        **_obter_config_cantina_db(db)
    }


# --- Produtos & Estoque ---

@router.get("/produtos", response_model=List[CantinaProdutoResponse])
def listar_produtos_cantina(
    apenas_ativos: bool = Query(False),
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("cantina"))
):
    _garantir_tabelas_cantina()
    query = db.query(CantinaProduto)
    if apenas_ativos:
        query = query.filter(CantinaProduto.ativo == True)
    return query.order_by(CantinaProduto.nome.asc()).all()


@router.post("/produtos", response_model=CantinaProdutoResponse, status_code=status.HTTP_201_CREATED)
def criar_produto_cantina(
    req: CantinaProdutoCreate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("cantina"))
):
    _garantir_tabelas_cantina()
    produto = CantinaProduto(
        nome=req.nome.strip(),
        categoria=(req.categoria or "Geral").strip(),
        imagem_url=req.imagem_url.strip() if req.imagem_url else None,
        quantidade_estoque=req.quantidade_estoque,
        valor_custo=req.valor_custo,
        margem_lucro=req.margem_lucro,
        preco_venda=req.preco_venda,
        ativo=req.ativo
    )
    db.add(produto)
    db.commit()
    db.refresh(produto)
    return produto


@router.put("/produtos/{produto_id}", response_model=CantinaProdutoResponse)
def atualizar_produto_cantina(
    produto_id: int,
    req: CantinaProdutoUpdate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("cantina"))
):
    produto = db.query(CantinaProduto).filter(CantinaProduto.id == produto_id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")

    dados = req.model_dump(exclude_unset=True)
    if "nome" in dados and dados["nome"] is not None:
        dados["nome"] = dados["nome"].strip()
    if "categoria" in dados and dados["categoria"] is not None:
        dados["categoria"] = dados["categoria"].strip() or "Geral"
    if "imagem_url" in dados:
        dados["imagem_url"] = dados["imagem_url"].strip() if dados["imagem_url"] else None

    for campo, valor in dados.items():
        setattr(produto, campo, valor)

    db.commit()
    db.refresh(produto)
    return produto


@router.patch("/produtos/{produto_id}/estoque", response_model=CantinaProdutoResponse)
def ajustar_estoque_produto(
    produto_id: int,
    req: CantinaEstoqueAjuste,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("cantina"))
):
    produto = db.query(CantinaProduto).filter(CantinaProduto.id == produto_id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")

    novo_estoque = max(0, (produto.quantidade_estoque or 0) + req.delta)
    produto.quantidade_estoque = novo_estoque
    db.commit()
    db.refresh(produto)
    return produto


@router.delete("/produtos/{produto_id}")
def excluir_produto_cantina(
    produto_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("cantina"))
):
    produto = db.query(CantinaProduto).filter(CantinaProduto.id == produto_id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")

    db.delete(produto)
    db.commit()
    return {"sucesso": True, "mensagem": "Produto removido com sucesso."}


# --- Frente de Caixa (PDV) & Registro de Vendas ---

@router.post("/vendas", response_model=CantinaVendaResponse, status_code=status.HTTP_201_CREATED)
def registrar_venda_cantina(
    req: CantinaVendaCreate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("cantina"))
):
    _garantir_tabelas_cantina()
    caixa_aberto = (
        db.query(CantinaCaixa)
        .filter(CantinaCaixa.status == "ABERTO")
        .order_by(CantinaCaixa.id.desc())
        .first()
    )
    if not caixa_aberto:
        raise HTTPException(
            status_code=400,
            detail="Nenhum caixa aberto no momento. Abra um caixa antes de registrar vendas no PDV."
        )

    if not req.itens or len(req.itens) == 0:
        raise HTTPException(status_code=400, detail="Adicione pelo menos um item ao carrinho para finalizar a venda.")

    forma = (req.forma_pagamento or "").upper().strip()
    if forma not in ("PIX", "DINHEIRO", "CARTAO"):
        raise HTTPException(status_code=400, detail="Forma de pagamento inválida. Escolha PIX, DINHEIRO ou CARTAO.")

    cfg = _obter_config_cantina_db(db)
    valor_custo_total = Decimal("0.00")
    valor_subtotal = Decimal("0.00")
    itens_para_salvar = []

    # Validar estoque e calcular totais
    for item_in in req.itens:
        produto = db.query(CantinaProduto).filter(CantinaProduto.id == item_in.produto_id).first()
        if not produto:
            raise HTTPException(status_code=404, detail=f"Produto #{item_in.produto_id} não encontrado.")
        if (produto.quantidade_estoque or 0) < item_in.quantidade:
            raise HTTPException(
                status_code=400,
                detail=f"Estoque insuficiente para '{produto.nome}'. Disponível: {produto.quantidade_estoque}, solicitado: {item_in.quantidade}."
            )

        custo_unit = Decimal(str(produto.valor_custo or 0))
        preco_unit = Decimal(str(produto.preco_venda or 0))
        qtd = int(item_in.quantidade)

        sub_custo = (custo_unit * qtd).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        sub_venda = (preco_unit * qtd).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        valor_custo_total += sub_custo
        valor_subtotal += sub_venda

        # Descontar do estoque
        produto.quantidade_estoque = (produto.quantidade_estoque or 0) - qtd

        itens_para_salvar.append(
            CantinaVendaItem(
                produto_id=produto.id,
                produto_nome=produto.nome,
                quantidade=qtd,
                valor_custo_unitario=custo_unit,
                preco_venda_unitario=preco_unit,
                subtotal_custo=sub_custo,
                subtotal_venda=sub_venda
            )
        )

    taxa_cartao_pct = Decimal("0.00")
    valor_taxa_cartao = Decimal("0.00")
    valor_total_cobrado = valor_subtotal
    valor_recebido_dinheiro = None
    valor_troco = None

    if forma == "CARTAO":
        taxa_cartao_pct = (
            req.taxa_cartao_percentual
            if req.taxa_cartao_percentual is not None
            else Decimal(str(cfg["taxa_maquina_cartao"]))
        )
        valor_total_cobrado, valor_taxa_cartao = _calcular_valor_maquina(
            valor_subtotal,
            taxa_cartao_pct,
            cfg["modo_calculo_taxa"]
        )
    elif forma == "DINHEIRO":
        if req.valor_recebido_dinheiro is not None:
            valor_recebido_dinheiro = Decimal(str(req.valor_recebido_dinheiro)).quantize(Decimal("0.01"))
            if valor_recebido_dinheiro < valor_subtotal:
                raise HTTPException(
                    status_code=400,
                    detail="O valor recebido em dinheiro não pode ser menor que o total da venda."
                )
            valor_troco = (valor_recebido_dinheiro - valor_subtotal).quantize(Decimal("0.01"))
        else:
            valor_recebido_dinheiro = valor_subtotal
            valor_troco = Decimal("0.00")

    nova_venda = CantinaVenda(
        caixa_id=caixa_aberto.id,
        forma_pagamento=forma,
        valor_custo_total=valor_custo_total,
        valor_subtotal=valor_subtotal,
        taxa_cartao_percentual=taxa_cartao_pct,
        valor_taxa_cartao=valor_taxa_cartao,
        valor_total_cobrado=valor_total_cobrado,
        valor_recebido_dinheiro=valor_recebido_dinheiro,
        valor_troco=valor_troco,
        cliente_nome=req.cliente_nome.strip() if req.cliente_nome else None,
        observacao=req.observacao.strip() if req.observacao else None,
        operador_id=admin.id,
        operador_nome=admin.nome,
        status="CONCLUIDA",
        itens=itens_para_salvar
    )

    db.add(nova_venda)
    db.commit()
    db.refresh(nova_venda)
    return nova_venda


@router.get("/vendas", response_model=List[CantinaVendaResponse])
def listar_vendas_cantina(
    caixa_id: Optional[int] = Query(None),
    forma_pagamento: Optional[str] = Query(None),
    status_filtro: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("cantina"))
):
    _garantir_tabelas_cantina()
    query = db.query(CantinaVenda).options(joinedload(CantinaVenda.itens))

    if caixa_id is not None:
        query = query.filter(CantinaVenda.caixa_id == caixa_id)

    if forma_pagamento and forma_pagamento.strip().upper() in ("PIX", "DINHEIRO", "CARTAO"):
        query = query.filter(CantinaVenda.forma_pagamento == forma_pagamento.strip().upper())

    if status_filtro and status_filtro.strip().upper() in ("CONCLUIDA", "CANCELADA"):
        query = query.filter(CantinaVenda.status == status_filtro.strip().upper())

    vendas = query.order_by(CantinaVenda.created_at.desc()).limit(limit).all()

    if search and search.strip():
        termo = search.strip().lower()
        vendas_filtradas = []
        for v in vendas:
            match_id = termo == str(v.id) or termo == f"#{v.id}"
            match_cliente = v.cliente_nome and termo in v.cliente_nome.lower()
            match_operador = v.operador_nome and termo in v.operador_nome.lower()
            match_item = any(termo in (it.produto_nome or "").lower() for it in (v.itens or []))
            if match_id or match_cliente or match_operador or match_item:
                vendas_filtradas.append(v)
        return vendas_filtradas

    return vendas


@router.post("/vendas/{venda_id}/estornar", response_model=CantinaVendaResponse)
def estornar_venda_cantina(
    venda_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("cantina"))
):
    venda = db.query(CantinaVenda).options(joinedload(CantinaVenda.itens)).filter(CantinaVenda.id == venda_id).first()
    if not venda:
        raise HTTPException(status_code=404, detail="Venda não encontrada.")

    if venda.status == "CANCELADA":
        raise HTTPException(status_code=400, detail="Esta venda já foi cancelada/estornada.")

    # Devolver os itens ao estoque
    for item in venda.itens:
        if item.produto_id:
            produto = db.query(CantinaProduto).filter(CantinaProduto.id == item.produto_id).first()
            if produto:
                produto.quantidade_estoque = (produto.quantidade_estoque or 0) + item.quantidade

    venda.status = "CANCELADA"
    db.commit()
    db.refresh(venda)
    return venda


# --- Financeiro, Balanço de Custos/Lucros & Relatórios (Por Caixa ou Consolidado) ---

@router.get("/financeiro")
def obter_financeiro_cantina(
    caixa_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_permissao("cantina"))
):
    _garantir_tabelas_cantina()
    produtos = db.query(CantinaProduto).order_by(CantinaProduto.nome.asc()).all()

    # Carregar todos os caixas para o seletor e histórico
    todos_caixas = (
        db.query(CantinaCaixa)
        .options(joinedload(CantinaCaixa.movimentacoes))
        .order_by(CantinaCaixa.id.desc())
        .all()
    )
    todas_vendas_db = (
        db.query(CantinaVenda)
        .options(joinedload(CantinaVenda.itens))
        .order_by(CantinaVenda.created_at.desc())
        .all()
    )

    vendas_por_caixa = {}
    for v in todas_vendas_db:
        if v.caixa_id:
            vendas_por_caixa.setdefault(v.caixa_id, []).append(v)

    caixas_resumo = [
        _calcular_resumo_caixa(cx, vendas_por_caixa.get(cx.id, []), cx.movimentacoes or [])
        for cx in todos_caixas
    ]
    caixa_selecionado_resumo = None

    if caixa_id is not None:
        caixa_selecionado_resumo = next((c for c in caixas_resumo if c["id"] == caixa_id), None)
        vendas_concluidas = [v for v in todas_vendas_db if v.status == "CONCLUIDA" and v.caixa_id == caixa_id]
    else:
        vendas_concluidas = [v for v in todas_vendas_db if v.status == "CONCLUIDA"]

    custo_estoque_atual = sum(
        float(p.valor_custo or 0) * int(p.quantidade_estoque or 0)
        for p in produtos
    )
    valor_venda_potencial_estoque = sum(
        float(p.preco_venda or 0) * int(p.quantidade_estoque or 0)
        for p in produtos
    )

    custo_itens_vendidos = sum(float(v.valor_custo_total or 0) for v in vendas_concluidas)
    receita_vendas_liquida = sum(float(v.valor_subtotal or 0) for v in vendas_concluidas)
    receita_total_cobrada = sum(float(v.valor_total_cobrado or 0) for v in vendas_concluidas)
    total_taxas_maquina = sum(float(v.valor_taxa_cartao or 0) for v in vendas_concluidas)

    # No modo filtrado por caixa, o investimento de referência daquele caixa é o custo dos itens vendidos nele;
    # no modo consolidado geral, é o custo total investido no evento (estoque atual + itens vendidos).
    custo_total_investido_evento = custo_estoque_atual + sum(float(v.valor_custo_total or 0) for v in todas_vendas_db if v.status == "CONCLUIDA")
    custo_total_investido = custo_itens_vendidos if caixa_id is not None else custo_total_investido_evento

    lucro_sobre_vendidos = receita_vendas_liquida - custo_itens_vendidos
    margem_real_vendidos = (
        round((lucro_sobre_vendidos / custo_itens_vendidos) * 100, 2)
        if custo_itens_vendidos > 0 else 0.0
    )

    saldo_sobre_investimento_total = receita_vendas_liquida - custo_total_investido
    falta_para_empatar = max(0.0, custo_total_investido - receita_vendas_liquida)
    lucro_caixa_apos_estoque = max(0.0, receita_vendas_liquida - custo_total_investido)
    percentual_recuperacao_investimento = (
        round((receita_vendas_liquida / custo_total_investido) * 100, 1)
        if custo_total_investido > 0 else (100.0 if receita_vendas_liquida > 0 else 0.0)
    )

    por_forma = {
        "PIX": {"quantidade_pedidos": 0, "valor_liquido": 0.0, "valor_cobrado": 0.0},
        "DINHEIRO": {"quantidade_pedidos": 0, "valor_liquido": 0.0, "valor_cobrado": 0.0},
        "CARTAO": {"quantidade_pedidos": 0, "valor_liquido": 0.0, "valor_cobrado": 0.0, "taxas_maquina": 0.0}
    }

    mapa_vendas_produto = {}
    total_itens_vendidos = 0

    for v in vendas_concluidas:
        fp = (v.forma_pagamento or "PIX").upper()
        if fp not in por_forma:
            por_forma[fp] = {"quantidade_pedidos": 0, "valor_liquido": 0.0, "valor_cobrado": 0.0}
        por_forma[fp]["quantidade_pedidos"] += 1
        por_forma[fp]["valor_liquido"] = round(por_forma[fp]["valor_liquido"] + float(v.valor_subtotal or 0), 2)
        por_forma[fp]["valor_cobrado"] = round(por_forma[fp]["valor_cobrado"] + float(v.valor_total_cobrado or 0), 2)
        if fp == "CARTAO":
            por_forma[fp]["taxas_maquina"] = round(por_forma[fp].get("taxas_maquina", 0.0) + float(v.valor_taxa_cartao or 0), 2)

        for it in v.itens:
            total_itens_vendidos += int(it.quantidade or 0)
            key = it.produto_id or f"nome:{it.produto_nome}"
            if key not in mapa_vendas_produto:
                mapa_vendas_produto[key] = {
                    "produto_id": it.produto_id,
                    "nome": it.produto_nome,
                    "qtd_vendida": 0,
                    "custo_vendido": 0.0,
                    "receita_vendida": 0.0
                }
            mapa_vendas_produto[key]["qtd_vendida"] += int(it.quantidade or 0)
            mapa_vendas_produto[key]["custo_vendido"] += float(it.subtotal_custo or 0)
            mapa_vendas_produto[key]["receita_vendida"] += float(it.subtotal_venda or 0)

    relatorio_produtos = []
    produtos_ids_processados = set()

    for p in produtos:
        produtos_ids_processados.add(p.id)
        stats = mapa_vendas_produto.get(p.id, {})
        qtd_vendida = stats.get("qtd_vendida", 0)
        custo_vendido = round(stats.get("custo_vendido", 0.0), 2)
        receita_vendida = round(stats.get("receita_vendida", 0.0), 2)
        lucro_vendido = round(receita_vendida - custo_vendido, 2)

        qtd_estoque = int(p.quantidade_estoque or 0)
        custo_unit = float(p.valor_custo or 0)
        preco_unit = float(p.preco_venda or 0)
        custo_em_estoque = round(custo_unit * qtd_estoque, 2)
        custo_total_produto = round(custo_em_estoque + custo_vendido, 2) if caixa_id is None else custo_vendido

        relatorio_produtos.append({
            "id": p.id,
            "nome": p.nome,
            "categoria": p.categoria or "Geral",
            "imagem_url": p.imagem_url,
            "quantidade_estoque": qtd_estoque,
            "qtd_vendida": qtd_vendida,
            "qtd_total_comprada": qtd_estoque + qtd_vendida,
            "valor_custo_unitario": round(custo_unit, 2),
            "margem_cadastrada": round(float(p.margem_lucro or 0), 2),
            "preco_venda_unitario": round(preco_unit, 2),
            "custo_em_estoque": custo_em_estoque,
            "custo_vendido": custo_vendido,
            "custo_total_investido": custo_total_produto,
            "receita_vendida": receita_vendida,
            "lucro_sobre_vendidos": lucro_vendido,
            "saldo_investimento_produto": round(receita_vendida - custo_total_produto, 2)
        })

    # Incluir eventuais produtos já excluídos mas que tiveram vendas históricas
    for key, stats in mapa_vendas_produto.items():
        if stats["produto_id"] not in produtos_ids_processados:
            custo_vendido = round(stats["custo_vendido"], 2)
            receita_vendida = round(stats["receita_vendida"], 2)
            relatorio_produtos.append({
                "id": stats["produto_id"] or 0,
                "nome": f"{stats['nome']} (Removido)",
                "categoria": "Histórico",
                "imagem_url": None,
                "quantidade_estoque": 0,
                "qtd_vendida": stats["qtd_vendida"],
                "qtd_total_comprada": stats["qtd_vendida"],
                "valor_custo_unitario": round(custo_vendido / stats["qtd_vendida"], 2) if stats["qtd_vendida"] else 0.0,
                "margem_cadastrada": 0.0,
                "preco_venda_unitario": round(receita_vendida / stats["qtd_vendida"], 2) if stats["qtd_vendida"] else 0.0,
                "custo_em_estoque": 0.0,
                "custo_vendido": custo_vendido,
                "custo_total_investido": custo_vendido,
                "receita_vendida": receita_vendida,
                "lucro_sobre_vendidos": round(receita_vendida - custo_vendido, 2),
                "saldo_investimento_produto": round(receita_vendida - custo_vendido, 2)
            })

    relatorio_produtos.sort(key=lambda x: x["receita_vendida"], reverse=True)

    # Resumo de gaveta (específico do caixa selecionado ou soma consolidada dos caixas)
    if caixa_selecionado_resumo:
        resumo_gaveta = {
            "modo": "CAIXA_ESPECIFICO",
            "caixa_id": caixa_selecionado_resumo["id"],
            "descricao": caixa_selecionado_resumo["descricao"],
            "data_referencia": caixa_selecionado_resumo["data_referencia"],
            "status": caixa_selecionado_resumo["status"],
            "valor_inicial": caixa_selecionado_resumo["valor_inicial"],
            "vendas_dinheiro": caixa_selecionado_resumo["vendas_dinheiro"],
            "total_suprimentos": caixa_selecionado_resumo["total_suprimentos"],
            "total_sangrias": caixa_selecionado_resumo["total_sangrias"],
            "saldo_dinheiro_gaveta": caixa_selecionado_resumo["saldo_dinheiro_gaveta"],
            "valor_fechamento_informado": caixa_selecionado_resumo["valor_fechamento_informado"],
            "diferenca_fechamento": caixa_selecionado_resumo["diferenca_fechamento"],
            "movimentacoes": caixa_selecionado_resumo["movimentacoes"]
        }
    else:
        soma_inicial = round(sum(c["valor_inicial"] for c in caixas_resumo), 2)
        soma_dinheiro = round(por_forma["DINHEIRO"]["valor_liquido"], 2)
        soma_suprimentos = round(sum(c["total_suprimentos"] for c in caixas_resumo), 2)
        soma_sangrias = round(sum(c["total_sangrias"] for c in caixas_resumo), 2)
        todas_movs = []
        for c in caixas_resumo:
            for m in c.get("movimentacoes", []):
                todas_movs.append({
                    **m,
                    "caixa_descricao": c["descricao"],
                    "caixa_data": c["data_referencia"]
                })
        todas_movs.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        resumo_gaveta = {
            "modo": "CONSOLIDADO",
            "caixa_id": None,
            "descricao": "Consolidado Geral (Todos os Caixas)",
            "data_referencia": "Todos os dias",
            "status": "CONSOLIDADO",
            "valor_inicial": soma_inicial,
            "vendas_dinheiro": soma_dinheiro,
            "total_suprimentos": soma_suprimentos,
            "total_sangrias": soma_sangrias,
            "saldo_dinheiro_gaveta": round(soma_inicial + soma_dinheiro + soma_suprimentos - soma_sangrias, 2),
            "valor_fechamento_informado": None,
            "diferenca_fechamento": None,
            "movimentacoes": todas_movs
        }

    return {
        "filtro_caixa_id": caixa_id,
        "caixa_selecionado": caixa_selecionado_resumo,
        "caixas": caixas_resumo,
        "resumo_gaveta": resumo_gaveta,
        "resumo": {
            "total_pedidos": len(vendas_concluidas),
            "total_itens_vendidos": total_itens_vendidos,
            "total_produtos_cadastrados": len(produtos),
            "total_unidades_estoque": sum(int(p.quantidade_estoque or 0) for p in produtos),
            "custo_estoque_atual": round(custo_estoque_atual, 2),
            "valor_venda_potencial_estoque": round(valor_venda_potencial_estoque, 2),
            "custo_itens_vendidos": round(custo_itens_vendidos, 2),
            "custo_total_investido": round(custo_total_investido, 2),
            "custo_total_investido_evento": round(custo_total_investido_evento, 2),
            "receita_vendas_liquida": round(receita_vendas_liquida, 2),
            "receita_total_cobrada": round(receita_total_cobrada, 2),
            "total_taxas_maquina": round(total_taxas_maquina, 2),
            "lucro_sobre_vendidos": round(lucro_sobre_vendidos, 2),
            "margem_real_vendidos": margem_real_vendidos,
            "saldo_sobre_investimento_total": round(saldo_sobre_investimento_total, 2),
            "falta_para_empatar": round(falta_para_empatar, 2),
            "lucro_caixa_apos_estoque": round(lucro_caixa_apos_estoque, 2),
            "percentual_recuperacao_investimento": percentual_recuperacao_investimento
        },
        "por_forma_pagamento": por_forma,
        "relatorio_produtos": relatorio_produtos,
        "config": _obter_config_cantina_db(db)
    }
