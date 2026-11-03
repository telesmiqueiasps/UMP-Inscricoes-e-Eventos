let produtosCantina = [];
let carrinhoPDV = {}; // { [produtoId]: quantidade }
let categoriaAtivaPDV = 'TODAS';
let formaPagamentoPDV = 'PIX';
let configCantina = {
  taxa_maquina_cartao: 0.0,
  modo_calculo_taxa: 'REPASSE'
};
let dadosFinanceirosCache = null;
let vendasHistoricoCache = [];

function formatBRL(val) {
  const num = Number(val || 0);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', async () => {
  const token = API.getToken();
  const user = API.getUser();
  if (!token || !user || !user.is_admin) return;

  await inicializarModuloCantina();
});

async function inicializarModuloCantina() {
  await Promise.all([
    carregarConfigCantina(),
    carregarProdutosCantina()
  ]);
  atualizarCalculosPagamentoPDV();
}

// ==============================================================
// Navegação entre as Sub-Abas da Cantina
// ==============================================================
window.trocarAbaCantina = async function(paneId, btnEl) {
  document.querySelectorAll('.cantina-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.cantina-tab-btn').forEach(b => b.classList.remove('active'));

  const pane = document.getElementById(paneId);
  if (pane) pane.classList.add('active');
  if (btnEl) btnEl.classList.add('active');

  if (paneId === 'pane-pdv' || paneId === 'pane-estoque') {
    await carregarProdutosCantina();
  } else if (paneId === 'pane-financeiro') {
    await Promise.all([
      carregarFinanceiroCantina(),
      carregarHistoricoVendasCantina()
    ]);
  }
};

// ==============================================================
// Configuração de Taxa da Máquina de Cartão
// ==============================================================
async function carregarConfigCantina() {
  try {
    const data = await API.request('/admin/cantina/config');
    if (data) {
      configCantina.taxa_maquina_cartao = Number(data.taxa_maquina_cartao || 0);
      configCantina.modo_calculo_taxa = data.modo_calculo_taxa || 'REPASSE';
      atualizarBadgesTaxaUI();
    }
  } catch (err) {
    console.warn('Erro ao carregar config da cantina:', err);
  }
}

function atualizarBadgesTaxaUI() {
  const taxaFmt = configCantina.taxa_maquina_cartao.toFixed(2).replace('.', ',') + '%';
  const badgeTopo = document.getElementById('badge-taxa-topo');
  if (badgeTopo) badgeTopo.textContent = taxaFmt;

  const labelPDV = document.getElementById('pdv-cartao-taxa-label');
  if (labelPDV) labelPDV.textContent = taxaFmt;

  atualizarCalculosPagamentoPDV();
}

window.abrirModalTaxaMaquina = function() {
  document.getElementById('cfg-taxa-cartao').value = configCantina.taxa_maquina_cartao;
  document.getElementById('cfg-modo-taxa').value = configCantina.modo_calculo_taxa || 'REPASSE';
  document.getElementById('modal-taxa-maquina').style.display = 'flex';
};

window.fecharModalTaxaMaquina = function() {
  document.getElementById('modal-taxa-maquina').style.display = 'none';
};

window.salvarConfigTaxaMaquina = async function(e) {
  e.preventDefault();
  const taxa = parseFloat(document.getElementById('cfg-taxa-cartao').value || '0');
  const modo = document.getElementById('cfg-modo-taxa').value;

  try {
    const res = await API.request('/admin/cantina/config', {
      method: 'PUT',
      body: JSON.stringify({
        taxa_maquina_cartao: isNaN(taxa) ? 0 : taxa,
        modo_calculo_taxa: modo
      })
    });
    configCantina.taxa_maquina_cartao = Number(res.taxa_maquina_cartao || 0);
    configCantina.modo_calculo_taxa = res.modo_calculo_taxa || 'REPASSE';
    atualizarBadgesTaxaUI();
    fecharModalTaxaMaquina();
    showToast('Taxa da máquina atualizada com sucesso!', 'success');
  } catch (err) {
    showToast(err.message || 'Erro ao salvar taxa da máquina.', 'error');
  }
};

// ==============================================================
// Carregamento de Produtos, Vitrine PDV e Estoque
// ==============================================================
async function carregarProdutosCantina() {
  try {
    const data = await API.request('/admin/cantina/produtos');
    produtosCantina = Array.isArray(data) ? data : [];
    renderizarChipsCategoriasPDV();
    renderizarVitrinePDV();
    renderizarTabelaEstoque();
    renderizarCarrinhoPDV();
  } catch (err) {
    console.error('Erro ao carregar produtos:', err);
  }
}

function renderizarChipsCategoriasPDV() {
  const container = document.getElementById('pdv-categorias-chips');
  if (!container) return;

  const cats = new Set();
  produtosCantina.forEach(p => {
    if (p.categoria && p.categoria.trim()) {
      cats.add(p.categoria.trim());
    }
  });

  const lista = ['TODAS', ...Array.from(cats)];
  if (!lista.includes(categoriaAtivaPDV)) {
    categoriaAtivaPDV = 'TODAS';
  }

  container.innerHTML = lista.map(cat => {
    const isAtiva = cat === categoriaAtivaPDV;
    const label = cat === 'TODAS' ? 'Todos' : escapeHtml(cat);
    return `<button type="button" class="cat-chip ${isAtiva ? 'active' : ''}" onclick="filtrarCategoriaPDV('${escapeHtml(cat)}')">${label}</button>`;
  }).join('');
}

window.filtrarCategoriaPDV = function(cat) {
  categoriaAtivaPDV = cat;
  renderizarChipsCategoriasPDV();
  renderizarVitrinePDV();
};

window.renderizarVitrinePDV = function() {
  const grid = document.getElementById('pdv-products-grid');
  if (!grid) return;

  const termo = (document.getElementById('pdv-busca-input')?.value || '').toLowerCase().trim();

  const filtrados = produtosCantina.filter(p => {
    if (!p.ativo) return false;
    const matchCat = categoriaAtivaPDV === 'TODAS' || (p.categoria || 'Geral') === categoriaAtivaPDV;
    const matchTermo = !termo || p.nome.toLowerCase().includes(termo) || (p.categoria || '').toLowerCase().includes(termo);
    return matchCat && matchTermo;
  });

  if (filtrados.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; background: #FFFFFF; border-radius: 14px; border: 1px dashed var(--border-color);">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">🍔</div>
        <strong style="display: block; color: var(--text-main); margin-bottom: 0.25rem;">Nenhum produto encontrado</strong>
        <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem;">Cadastre produtos na cantina para iniciar as vendas no PDV.</p>
        <button type="button" class="btn btn-primary btn-sm" onclick="abrirModalProduto()">+ Cadastrar Primeiro Produto</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtrados.map(p => {
    const qtdNoCarrinho = carrinhoPDV[p.id] || 0;
    const estoqueTotal = Number(p.quantidade_estoque || 0);
    const disponivelRestante = Math.max(0, estoqueTotal - qtdNoCarrinho);
    const esgotado = estoqueTotal <= 0;

    let stockClass = 'pdv-stock-ok';
    let stockText = `${estoqueTotal} disp.`;
    if (esgotado) {
      stockClass = 'pdv-stock-zero';
      stockText = 'Esgotado';
    } else if (estoqueTotal <= 5) {
      stockClass = 'pdv-stock-low';
      stockText = `Restam ${estoqueTotal}`;
    }

    const imgHtml = p.imagem_url
      ? `<img src="${escapeHtml(p.imagem_url)}" alt="${escapeHtml(p.nome)}" onerror="this.style.display='none'; this.parentElement.insertAdjacentHTML('beforeend', '<span style=\\'font-size:2.2rem;\\'>🥤</span>');">`
      : `<span style="font-size: 2.2rem;">🍔</span>`;

    return `
      <div class="pdv-product-card ${esgotado ? 'esgotado' : ''} ${qtdNoCarrinho > 0 ? 'in-cart' : ''}"
           onclick="${esgotado ? '' : `adicionarAoCarrinhoPDV(${p.id})`}">
        <div class="pdv-product-img-wrap">
          ${imgHtml}
          <span class="pdv-stock-badge ${stockClass}">${stockText}</span>
          ${qtdNoCarrinho > 0 ? `<span class="pdv-cart-qty-badge">${qtdNoCarrinho} no pedido</span>` : ''}
        </div>
        <div class="pdv-product-body">
          <div>
            <div class="pdv-product-cat">${escapeHtml(p.categoria || 'Geral')}</div>
            <div class="pdv-product-title">${escapeHtml(p.nome)}</div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <div class="pdv-product-price">${formatBRL(p.preco_venda)}</div>
            ${!esgotado ? `<span style="font-size: 0.72rem; font-weight: 700; color: #FF7900;">+ Adicionar</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
};

// ==============================================================
// Carrinho do PDV & Cálculos de Troco / Maquininha
// ==============================================================
window.adicionarAoCarrinhoPDV = function(produtoId) {
  const produto = produtosCantina.find(p => p.id === produtoId);
  if (!produto) return;

  const atual = carrinhoPDV[produtoId] || 0;
  const estoque = Number(produto.quantidade_estoque || 0);

  if (atual + 1 > estoque) {
    showToast(`Estoque máximo atingido para "${produto.nome}" (${estoque} un.).`, 'warning');
    return;
  }

  carrinhoPDV[produtoId] = atual + 1;
  renderizarVitrinePDV();
  renderizarCarrinhoPDV();
};

window.alterarQtdCarrinhoPDV = function(produtoId, delta) {
  const produto = produtosCantina.find(p => p.id === produtoId);
  if (!produto) return;

  const atual = carrinhoPDV[produtoId] || 0;
  const novo = atual + delta;

  if (novo <= 0) {
    delete carrinhoPDV[produtoId];
  } else if (novo > Number(produto.quantidade_estoque || 0)) {
    showToast(`Apenas ${produto.quantidade_estoque} unidades disponíveis em estoque.`, 'warning');
    return;
  } else {
    carrinhoPDV[produtoId] = novo;
  }

  renderizarVitrinePDV();
  renderizarCarrinhoPDV();
};

window.limparCarrinhoPDV = function() {
  carrinhoPDV = {};
  const inputRec = document.getElementById('pdv-valor-recebido');
  if (inputRec) inputRec.value = '';
  const inputCli = document.getElementById('pdv-cliente-nome');
  if (inputCli) inputCli.value = '';
  renderizarVitrinePDV();
  renderizarCarrinhoPDV();
};

function obterSubtotalCarrinho() {
  let subtotal = 0;
  for (const [idStr, qtd] of Object.entries(carrinhoPDV)) {
    const p = produtosCantina.find(x => x.id === Number(idStr));
    if (p && qtd > 0) {
      subtotal += Number(p.preco_venda || 0) * qtd;
    }
  }
  return Math.round(subtotal * 100) / 100;
}

function renderizarCarrinhoPDV() {
  const container = document.getElementById('pdv-cart-items');
  const countBadge = document.getElementById('cart-count-badge');
  const subtotalEl = document.getElementById('pdv-subtotal-display');
  if (!container) return;

  const entries = Object.entries(carrinhoPDV).filter(([_, qtd]) => qtd > 0);
  const totalUnidades = entries.reduce((acc, [_, q]) => acc + q, 0);

  if (countBadge) {
    countBadge.textContent = `${totalUnidades} ${totalUnidades === 1 ? 'item' : 'itens'}`;
  }

  const subtotal = obterSubtotalCarrinho();
  if (subtotalEl) subtotalEl.textContent = formatBRL(subtotal);

  if (entries.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 2rem 0.5rem; font-size: 0.88rem;">
        Clique nos produtos ao lado para adicioná-los à venda.
      </div>
    `;
    atualizarCalculosPagamentoPDV();
    return;
  }

  container.innerHTML = entries.map(([idStr, qtd]) => {
    const p = produtosCantina.find(x => x.id === Number(idStr));
    if (!p) return '';
    const subItem = Number(p.preco_venda || 0) * qtd;
    return `
      <div class="pdv-cart-row">
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 700; font-size: 0.86rem; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${escapeHtml(p.nome)}
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted);" class="tabular-nums">
            ${formatBRL(p.preco_venda)} un. &bull; <strong style="color: #004C50;">${formatBRL(subItem)}</strong>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 0.35rem;">
          <button type="button" class="qty-btn" onclick="alterarQtdCarrinhoPDV(${p.id}, -1)">-</button>
          <span class="tabular-nums" style="font-weight: 800; font-size: 0.88rem; min-width: 22px; text-align: center;">${qtd}</span>
          <button type="button" class="qty-btn" onclick="alterarQtdCarrinhoPDV(${p.id}, 1)">+</button>
        </div>
      </div>
    `;
  }).join('');

  atualizarCalculosPagamentoPDV();
}

window.selecionarFormaPagamentoPDV = function(forma) {
  formaPagamentoPDV = forma;
  ['PIX', 'DINHEIRO', 'CARTAO'].forEach(f => {
    const btn = document.getElementById(`btn-pay-${f}`);
    if (btn) btn.classList.toggle('active', f === forma);
  });

  document.getElementById('pdv-box-pix').style.display = forma === 'PIX' ? 'block' : 'none';
  document.getElementById('pdv-box-dinheiro').style.display = forma === 'DINHEIRO' ? 'block' : 'none';
  document.getElementById('pdv-box-cartao').style.display = forma === 'CARTAO' ? 'block' : 'none';

  atualizarCalculosPagamentoPDV();
};

window.preencherCedulaRapida = function(valor) {
  const subtotal = obterSubtotalCarrinho();
  const input = document.getElementById('pdv-valor-recebido');
  if (!input) return;

  if (valor === 'EXATO') {
    input.value = subtotal.toFixed(2);
  } else {
    input.value = Number(valor).toFixed(2);
  }
  atualizarCalculosPagamentoPDV();
};

function calcularValorCobrarMaquinaJS(subtotal) {
  const taxa = Number(configCantina.taxa_maquina_cartao || 0);
  if (taxa <= 0 || subtotal <= 0) {
    return { totalCobrado: subtotal, valorTaxa: 0 };
  }

  let totalCobrado = subtotal;
  if (configCantina.modo_calculo_taxa === 'ACRESCIMO') {
    totalCobrado = subtotal * (1 + taxa / 100);
  } else {
    const divisor = Math.max(0.01, 1 - taxa / 100);
    totalCobrado = subtotal / divisor;
  }

  totalCobrado = Math.round(totalCobrado * 100) / 100;
  const valorTaxa = Math.round((totalCobrado - subtotal) * 100) / 100;
  return { totalCobrado, valorTaxa };
}

window.atualizarCalculosPagamentoPDV = function() {
  const subtotal = obterSubtotalCarrinho();

  // 1. PIX
  const pixEl = document.getElementById('pdv-pix-total');
  if (pixEl) pixEl.textContent = formatBRL(subtotal);

  // 2. DINHEIRO (Troco)
  const recInput = document.getElementById('pdv-valor-recebido');
  const trocoEl = document.getElementById('pdv-troco-display');
  if (trocoEl) {
    const valRecebido = parseFloat(recInput?.value || '0');
    if (!recInput?.value || isNaN(valRecebido) || valRecebido === 0) {
      trocoEl.textContent = formatBRL(0);
      trocoEl.style.color = '#34D399';
    } else if (valRecebido < subtotal) {
      const falta = subtotal - valRecebido;
      trocoEl.textContent = `Faltam ${formatBRL(falta)}`;
      trocoEl.style.color = '#F87171';
    } else {
      const troco = valRecebido - subtotal;
      trocoEl.textContent = formatBRL(troco);
      trocoEl.style.color = '#34D399';
    }
  }

  // 3. CARTÃO (Taxa da Máquina)
  const { totalCobrado, valorTaxa } = calcularValorCobrarMaquinaJS(subtotal);
  const acrescimoEl = document.getElementById('pdv-cartao-acrescimo');
  const totalMaqEl = document.getElementById('pdv-cartao-total-maquina');
  if (acrescimoEl) acrescimoEl.textContent = `+ ${formatBRL(valorTaxa)}`;
  if (totalMaqEl) totalMaqEl.textContent = formatBRL(totalCobrado);
};

window.finalizarVendaPDV = async function() {
  const entries = Object.entries(carrinhoPDV).filter(([_, qtd]) => qtd > 0);
  if (entries.length === 0) {
    showToast('Adicione pelo menos um produto ao carrinho antes de finalizar.', 'warning');
    return;
  }

  const subtotal = obterSubtotalCarrinho();
  let valorRecebidoDinheiro = null;

  if (formaPagamentoPDV === 'DINHEIRO') {
    const rawRec = document.getElementById('pdv-valor-recebido')?.value;
    if (rawRec && rawRec.trim() !== '') {
      valorRecebidoDinheiro = parseFloat(rawRec);
      if (valorRecebidoDinheiro < subtotal) {
        showToast('O valor recebido em dinheiro é menor que o total da venda.', 'error');
        return;
      }
    } else {
      valorRecebidoDinheiro = subtotal;
    }
  }

  const payload = {
    forma_pagamento: formaPagamentoPDV,
    itens: entries.map(([idStr, qtd]) => ({
      produto_id: Number(idStr),
      quantidade: Number(qtd)
    })),
    taxa_cartao_percentual: formaPagamentoPDV === 'CARTAO' ? configCantina.taxa_maquina_cartao : 0,
    valor_recebido_dinheiro: valorRecebidoDinheiro,
    cliente_nome: document.getElementById('pdv-cliente-nome')?.value.trim() || null
  };

  const btn = document.getElementById('btn-finalizar-venda');
  const originalText = btn ? btn.innerHTML : '✅ Finalizar Venda';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⏳ Registrando venda...';
  }

  try {
    const venda = await API.request('/admin/cantina/vendas', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    let msgSucesso = `Venda #${venda.id} concluída (${formatBRL(venda.valor_subtotal)})!`;
    if (formaPagamentoPDV === 'DINHEIRO' && Number(venda.valor_troco) > 0) {
      msgSucesso += ` Troco: ${formatBRL(venda.valor_troco)}`;
    } else if (formaPagamentoPDV === 'CARTAO') {
      msgSucesso += ` Cobrado na máquina: ${formatBRL(venda.valor_total_cobrado)}`;
    }

    showToast(msgSucesso, 'success');
    limparCarrinhoPDV();
    await carregarProdutosCantina();
  } catch (err) {
    showToast(err.message || 'Erro ao finalizar a venda.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
};

// ==============================================================
// Aba 2: Cadastro de Produtos, Precificação & Controle de Estoque
// ==============================================================
window.renderizarTabelaEstoque = function() {
  const tbody = document.getElementById('estoque-table-body');
  if (!tbody) return;

  // Atualizar cards de métricas do estoque
  const totalProdutos = produtosCantina.length;
  const totalUnidades = produtosCantina.reduce((acc, p) => acc + Number(p.quantidade_estoque || 0), 0);
  const custoEstoque = produtosCantina.reduce((acc, p) => acc + (Number(p.valor_custo || 0) * Number(p.quantidade_estoque || 0)), 0);
  const vendaPotencial = produtosCantina.reduce((acc, p) => acc + (Number(p.preco_venda || 0) * Number(p.quantidade_estoque || 0)), 0);

  const elProd = document.getElementById('est-total-produtos');
  const elUnid = document.getElementById('est-total-unidades');
  const elCusto = document.getElementById('est-custo-atual');
  const elPot = document.getElementById('est-venda-potencial');

  if (elProd) elProd.textContent = totalProdutos;
  if (elUnid) elUnid.textContent = totalUnidades;
  if (elCusto) elCusto.textContent = formatBRL(custoEstoque);
  if (elPot) elPot.textContent = formatBRL(vendaPotencial);

  const busca = (document.getElementById('estoque-busca-input')?.value || '').toLowerCase().trim();
  const filtrados = produtosCantina.filter(p => {
    return !busca || p.nome.toLowerCase().includes(busca) || (p.categoria || '').toLowerCase().includes(busca);
  });

  if (filtrados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhum produto encontrado no estoque.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtrados.map(p => {
    const custo = Number(p.valor_custo || 0);
    const preco = Number(p.preco_venda || 0);
    const lucroUnit = preco - custo;
    const margemReal = custo > 0 ? ((lucroUnit / custo) * 100) : Number(p.margem_lucro || 0);
    const est = Number(p.quantidade_estoque || 0);

    const imgThumb = p.imagem_url
      ? `<img src="${escapeHtml(p.imagem_url)}" style="width: 38px; height: 38px; border-radius: 8px; object-fit: cover; border: 1px solid var(--border-color);" onerror="this.style.display='none'">`
      : `<div style="width: 38px; height: 38px; border-radius: 8px; background: #F1F5F9; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">🍔</div>`;

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 0.65rem;">
            ${imgThumb}
            <div>
              <strong style="color: var(--text-main);">${escapeHtml(p.nome)}</strong>
              ${!p.ativo ? `<span class="badge badge-danger" style="margin-left: 0.35rem; font-size: 0.68rem;">Inativo</span>` : ''}
            </div>
          </div>
        </td>
        <td><span class="badge" style="background: #F1F5F9; color: #334155;">${escapeHtml(p.categoria || 'Geral')}</span></td>
        <td style="text-align: center;">
          <div style="display: inline-flex; align-items: center; gap: 0.35rem;">
            <button type="button" class="qty-btn" title="Diminuir 1" onclick="ajustarEstoqueRapido(${p.id}, -1)">-1</button>
            <span class="badge tabular-nums ${est === 0 ? 'badge-danger' : est <= 5 ? 'badge-warning' : 'badge-success'}" style="min-width: 48px; font-size: 0.82rem;">
              ${est} un.
            </span>
            <button type="button" class="qty-btn" title="Adicionar 1" onclick="ajustarEstoqueRapido(${p.id}, 1)">+1</button>
            <button type="button" class="qty-btn" style="width: auto; padding: 0 0.4rem; font-size: 0.72rem;" title="Adicionar 10" onclick="ajustarEstoqueRapido(${p.id}, 10)">+10</button>
          </div>
        </td>
        <td style="text-align: right;" class="tabular-nums">${formatBRL(custo)}</td>
        <td style="text-align: right;" class="tabular-nums">${margemReal.toFixed(1).replace('.', ',')}%</td>
        <td style="text-align: right; font-weight: 800; color: #004C50;" class="tabular-nums">${formatBRL(preco)}</td>
        <td style="text-align: right; font-weight: 700; color: ${lucroUnit >= 0 ? '#059669' : '#DC2626'};" class="tabular-nums">
          ${lucroUnit >= 0 ? '+' : ''}${formatBRL(lucroUnit)}
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <button type="button" class="btn btn-outline btn-sm" style="padding: 0.25rem 0.55rem; font-size: 0.78rem;" onclick="abrirModalEditarProduto(${p.id})">✏️ Editar</button>
          <button type="button" class="btn btn-danger btn-sm" style="padding: 0.25rem 0.55rem; font-size: 0.78rem;" onclick="excluirProdutoCantina(${p.id})">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
};

window.ajustarEstoqueRapido = async function(produtoId, delta) {
  try {
    await API.request(`/admin/cantina/produtos/${produtoId}/estoque`, {
      method: 'PATCH',
      body: JSON.stringify({ delta })
    });
    await carregarProdutosCantina();
  } catch (err) {
    showToast(err.message || 'Erro ao ajustar estoque.', 'error');
  }
};

window.abrirModalProduto = function() {
  document.getElementById('form-produto-cantina').reset();
  document.getElementById('prod-id').value = '';
  document.getElementById('prod-categoria').value = 'Geral';
  document.getElementById('prod-estoque').value = '0';
  document.getElementById('modal-produto-titulo').textContent = 'Novo Produto da Cantina';
  atualizarPreviewImagemProduto();
  atualizarResumoLucroModal(0, 0);
  document.getElementById('modal-produto-cantina').style.display = 'flex';
};

window.abrirModalEditarProduto = function(produtoId) {
  const p = produtosCantina.find(x => x.id === produtoId);
  if (!p) return;

  document.getElementById('prod-id').value = p.id;
  document.getElementById('prod-nome').value = p.nome;
  document.getElementById('prod-categoria').value = p.categoria || 'Geral';
  document.getElementById('prod-imagem-url').value = p.imagem_url || '';
  document.getElementById('prod-estoque').value = p.quantidade_estoque || 0;
  document.getElementById('prod-custo').value = Number(p.valor_custo || 0).toFixed(2);
  document.getElementById('prod-margem').value = Number(p.margem_lucro || 0).toFixed(2);
  document.getElementById('prod-preco-venda').value = Number(p.preco_venda || 0).toFixed(2);

  document.getElementById('modal-produto-titulo').textContent = 'Editar Produto';
  atualizarPreviewImagemProduto();

  const custo = Number(p.valor_custo || 0);
  const margem = Number(p.margem_lucro || 0);
  const sugerido = custo * (1 + margem / 100);
  atualizarResumoLucroModal(sugerido, Number(p.preco_venda || 0) - custo);

  document.getElementById('modal-produto-cantina').style.display = 'flex';
};

window.fecharModalProduto = function() {
  document.getElementById('modal-produto-cantina').style.display = 'none';
};

window.atualizarPreviewImagemProduto = function() {
  const url = (document.getElementById('prod-imagem-url')?.value || '').trim();
  const box = document.getElementById('prod-img-preview-box');
  if (!box) return;

  if (!url) {
    box.innerHTML = `<span style="font-size: 1.2rem;">🍔</span>`;
    return;
  }

  box.innerHTML = `<img src="${escapeHtml(url)}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.innerHTML='<span style=\\'font-size:1.2rem;\\'>⚠️</span>'">`;
};

// Quando digita Custo ou Margem (%), sugere e preenche o Preço de Venda automaticamente
window.aoAlterarCustoOuMargem = function() {
  const custo = parseFloat(document.getElementById('prod-custo')?.value || '0') || 0;
  const margem = parseFloat(document.getElementById('prod-margem')?.value || '0') || 0;

  const precoSugerido = Math.max(0, custo * (1 + margem / 100));
  const precoInput = document.getElementById('prod-preco-venda');
  if (precoInput) {
    precoInput.value = precoSugerido.toFixed(2);
  }

  const lucroUnit = precoSugerido - custo;
  atualizarResumoLucroModal(precoSugerido, lucroUnit);
};

// Quando o usuário edita o Preço de Venda manualmente, mantém o preço escolhido e recalcula a margem equivalente
window.aoAlterarPrecoVendaManual = function() {
  const custo = parseFloat(document.getElementById('prod-custo')?.value || '0') || 0;
  const precoManual = parseFloat(document.getElementById('prod-preco-venda')?.value || '0') || 0;

  const lucroUnit = precoManual - custo;
  let margemEquivalente = 0;
  if (custo > 0) {
    margemEquivalente = (lucroUnit / custo) * 100;
    const margemInput = document.getElementById('prod-margem');
    if (margemInput) {
      margemInput.value = margemEquivalente.toFixed(2);
    }
  }

  const sugerido = custo * (1 + margemEquivalente / 100);
  atualizarResumoLucroModal(sugerido, lucroUnit);
};

function atualizarResumoLucroModal(precoSugerido, lucroUnitario) {
  const elSug = document.getElementById('prod-preco-sugerido');
  const elLucro = document.getElementById('prod-lucro-unitario');
  if (elSug) elSug.textContent = formatBRL(precoSugerido);
  if (elLucro) {
    elLucro.textContent = `${lucroUnitario >= 0 ? '+' : ''}${formatBRL(lucroUnitario)}`;
    elLucro.style.color = lucroUnitario >= 0 ? '#059669' : '#DC2626';
  }
}

window.salvarProdutoCantina = async function(e) {
  e.preventDefault();
  const id = document.getElementById('prod-id').value;
  const payload = {
    nome: document.getElementById('prod-nome').value.trim(),
    categoria: document.getElementById('prod-categoria').value.trim() || 'Geral',
    imagem_url: document.getElementById('prod-imagem-url').value.trim() || null,
    quantidade_estoque: parseInt(document.getElementById('prod-estoque').value || '0', 10),
    valor_custo: parseFloat(document.getElementById('prod-custo').value || '0') || 0,
    margem_lucro: parseFloat(document.getElementById('prod-margem').value || '0') || 0,
    preco_venda: parseFloat(document.getElementById('prod-preco-venda').value || '0') || 0,
    ativo: true
  };

  try {
    if (id) {
      await API.request(`/admin/cantina/produtos/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast('Produto atualizado com sucesso!', 'success');
    } else {
      await API.request('/admin/cantina/produtos', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast('Produto cadastrado com sucesso!', 'success');
    }
    fecharModalProduto();
    await carregarProdutosCantina();
  } catch (err) {
    showToast(err.message || 'Erro ao salvar produto.', 'error');
  }
};

window.excluirProdutoCantina = async function(produtoId) {
  const p = produtosCantina.find(x => x.id === produtoId);
  if (!confirm(`Deseja realmente excluir o produto "${p ? p.nome : produtoId}"?`)) return;

  try {
    await API.request(`/admin/cantina/produtos/${produtoId}`, { method: 'DELETE' });
    delete carrinhoPDV[produtoId];
    showToast('Produto removido.', 'success');
    await carregarProdutosCantina();
  } catch (err) {
    showToast(err.message || 'Erro ao remover produto.', 'error');
  }
};

// ==============================================================
// Aba 3: Financeiro, Ponto de Equilíbrio, Vendas e Relatórios
// ==============================================================
async function carregarFinanceiroCantina() {
  try {
    const data = await API.request('/admin/cantina/financeiro');
    dadosFinanceirosCache = data;
    renderizarDashboardFinanceiro(data);
  } catch (err) {
    console.error('Erro ao carregar financeiro da cantina:', err);
  }
}

function renderizarDashboardFinanceiro(data) {
  if (!data || !data.resumo) return;
  const r = data.resumo;

  // 1. Cards principais
  document.getElementById('fin-custo-total-investido').textContent = formatBRL(r.custo_total_investido);
  document.getElementById('fin-detalhe-custo').textContent = `Vendido: ${formatBRL(r.custo_itens_vendidos)} | Em estoque: ${formatBRL(r.custo_estoque_atual)}`;

  document.getElementById('fin-receita-liquida').textContent = formatBRL(r.receita_vendas_liquida);
  document.getElementById('fin-detalhe-pedidos').textContent = `${r.total_pedidos} vendas concluídas (${r.total_itens_vendidos} itens)`;

  const elLucroVend = document.getElementById('fin-lucro-vendidos');
  elLucroVend.textContent = `${r.lucro_sobre_vendidos >= 0 ? '+' : ''}${formatBRL(r.lucro_sobre_vendidos)}`;
  elLucroVend.style.color = r.lucro_sobre_vendidos >= 0 ? '#059669' : '#DC2626';
  document.getElementById('fin-margem-media').textContent = `Margem média real s/ vendidos: ${Number(r.margem_real_vendidos || 0).toFixed(1).replace('.', ',')}%`;

  const elSaldo = document.getElementById('fin-saldo-caixa');
  const elSaldoLeg = document.getElementById('fin-saldo-legenda');
  if (r.saldo_sobre_investimento_total >= 0) {
    elSaldo.textContent = `+${formatBRL(r.saldo_sobre_investimento_total)}`;
    elSaldo.style.color = '#059669';
    elSaldoLeg.textContent = 'Lucro líquido após pagar 100% do estoque';
  } else {
    elSaldo.textContent = formatBRL(r.saldo_sobre_investimento_total);
    elSaldo.style.color = '#D97706';
    elSaldoLeg.textContent = `Faltam ${formatBRL(r.falta_para_empatar)} para pagar todo o estoque`;
  }

  // 2. Barra de Ponto de Equilíbrio (Break-Even)
  const pct = Math.min(100, Math.max(0, Number(r.percentual_recuperacao_investimento || 0)));
  document.getElementById('fin-progress-bar').style.width = `${pct}%`;
  document.getElementById('fin-progress-label').textContent = `${Number(r.percentual_recuperacao_investimento || 0).toFixed(1).replace('.', ',')}% do custo total de estoque recuperado`;

  const tituloStatus = document.getElementById('fin-status-titulo');
  const valorBreakeven = document.getElementById('fin-breakeven-valor');

  if (r.custo_total_investido === 0 && r.receita_vendas_liquida === 0) {
    tituloStatus.textContent = 'Aguardando movimentação da cantina';
    valorBreakeven.textContent = 'Sem custos/vendas registrados';
  } else if (r.saldo_sobre_investimento_total >= 0) {
    tituloStatus.textContent = `🎉 Ponto de Equilíbrio Atingido! Lucro Líquido no Caixa: ${formatBRL(r.lucro_caixa_apos_estoque)}`;
    valorBreakeven.textContent = `Estoque 100% pago + ${formatBRL(r.lucro_caixa_apos_estoque)} de lucro livre`;
    valorBreakeven.style.color = '#34D399';
  } else {
    tituloStatus.textContent = `Faltam ${formatBRL(r.falta_para_empatar)} em vendas para cobrir todo o estoque comprado`;
    valorBreakeven.textContent = `Já vendido: ${formatBRL(r.receita_vendas_liquida)} de ${formatBRL(r.custo_total_investido)} investidos`;
    valorBreakeven.style.color = '#FFD166';
  }

  // 3. Formas de Pagamento
  const fp = data.por_forma_pagamento || {};
  const pix = fp.PIX || { quantidade_pedidos: 0, valor_liquido: 0 };
  const din = fp.DINHEIRO || { quantidade_pedidos: 0, valor_liquido: 0 };
  const car = fp.CARTAO || { quantidade_pedidos: 0, valor_liquido: 0, valor_cobrado: 0, taxas_maquina: 0 };

  document.getElementById('fin-pay-pix').textContent = formatBRL(pix.valor_liquido);
  document.getElementById('fin-pay-pix-qtd').textContent = `${pix.quantidade_pedidos} pedidos realizados`;

  document.getElementById('fin-pay-dinheiro').textContent = formatBRL(din.valor_liquido);
  document.getElementById('fin-pay-dinheiro-qtd').textContent = `${din.quantidade_pedidos} pedidos realizados`;

  document.getElementById('fin-pay-cartao').textContent = formatBRL(car.valor_liquido);
  document.getElementById('fin-pay-cartao-detalhe').textContent = `${car.quantidade_pedidos} pedidos | Cobrado na máquina: ${formatBRL(car.valor_cobrado)} (Taxas: ${formatBRL(car.taxas_maquina)})`;

  // 4. Tabela de Relatório por Produto
  const tbodyProd = document.getElementById('fin-produtos-table-body');
  const relProds = data.relatorio_produtos || [];
  if (relProds.length === 0) {
    tbodyProd.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Nenhum produto cadastrado.</td></tr>`;
  } else {
    tbodyProd.innerHTML = relProds.map(p => `
      <tr>
        <td>
          <strong>${escapeHtml(p.nome)}</strong>
          <div style="font-size: 0.75rem; color: var(--text-muted);">Custo un.: ${formatBRL(p.valor_custo_unitario)} | Venda un.: ${formatBRL(p.preco_venda_unitario)}</div>
        </td>
        <td style="text-align: center; font-weight: 700;" class="tabular-nums">${p.qtd_vendida} un.</td>
        <td style="text-align: center;" class="tabular-nums">${p.quantidade_estoque} un.</td>
        <td style="text-align: right;" class="tabular-nums">${formatBRL(p.custo_total_investido)}</td>
        <td style="text-align: right;" class="tabular-nums">${formatBRL(p.custo_vendido)}</td>
        <td style="text-align: right; font-weight: 800; color: #2563EB;" class="tabular-nums">${formatBRL(p.receita_vendida)}</td>
        <td style="text-align: right; font-weight: 700; color: ${p.lucro_sobre_vendidos >= 0 ? '#059669' : '#DC2626'};" class="tabular-nums">
          ${p.lucro_sobre_vendidos >= 0 ? '+' : ''}${formatBRL(p.lucro_sobre_vendidos)}
        </td>
        <td style="text-align: right; font-weight: 700; color: ${p.saldo_investimento_produto >= 0 ? '#059669' : '#D97706'};" class="tabular-nums">
          ${p.saldo_investimento_produto >= 0 ? '+' : ''}${formatBRL(p.saldo_investimento_produto)}
        </td>
      </tr>
    `).join('');
  }
}

window.carregarHistoricoVendasCantina = async function() {
  const tbody = document.getElementById('fin-vendas-table-body');
  if (!tbody) return;

  const busca = (document.getElementById('fin-vendas-busca')?.value || '').trim();
  const forma = (document.getElementById('fin-vendas-forma')?.value || '').trim();

  let url = '/admin/cantina/vendas?limit=500';
  if (forma) url += `&forma_pagamento=${encodeURIComponent(forma)}`;
  if (busca) url += `&search=${encodeURIComponent(busca)}`;

  try {
    const vendas = await API.request(url);
    vendasHistoricoCache = Array.isArray(vendas) ? vendas : [];

    if (vendasHistoricoCache.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Nenhuma venda registrada com os filtros selecionados.</td></tr>`;
      return;
    }

    tbody.innerHTML = vendasHistoricoCache.map(v => {
      const cancelada = v.status === 'CANCELADA';
      const dt = v.created_at ? new Date(v.created_at).toLocaleString('pt-BR') : '-';
      const itensTexto = (v.itens || []).map(it => `${it.quantidade}x ${escapeHtml(it.produto_nome)}`).join(', ');
      const custo = Number(v.valor_custo_total || 0);
      const vendaVal = Number(v.valor_subtotal || 0);
      const lucro = vendaVal - custo;

      let badgePag = `<span class="badge badge-success">💠 PIX</span>`;
      let detalheCobrado = formatBRL(v.valor_total_cobrado);

      if (v.forma_pagamento === 'DINHEIRO') {
        badgePag = `<span class="badge badge-warning">💵 Dinheiro</span>`;
        if (Number(v.valor_troco || 0) > 0) {
          detalheCobrado = `Rec: ${formatBRL(v.valor_recebido_dinheiro)}<br><small style="color:#059669;">Troco: ${formatBRL(v.valor_troco)}</small>`;
        }
      } else if (v.forma_pagamento === 'CARTAO') {
        badgePag = `<span class="badge" style="background:#EFF6FF; color:#2563EB;">💳 Cartão (${Number(v.taxa_cartao_percentual || 0).toFixed(2).replace('.', ',')}%)</span>`;
        detalheCobrado = `<strong>${formatBRL(v.valor_total_cobrado)}</strong><br><small style="color:var(--text-muted);">Taxa: +${formatBRL(v.valor_taxa_cartao)}</small>`;
      }

      return `
        <tr style="${cancelada ? 'opacity: 0.52; text-decoration: line-through;' : ''}">
          <td class="tabular-nums">
            <strong>#${v.id}</strong>
            <div style="font-size: 0.74rem; color: var(--text-muted);">${dt}</div>
          </td>
          <td style="max-width: 260px; white-space: normal; font-size: 0.84rem;">${itensTexto || '-'}</td>
          <td style="font-size: 0.82rem;">
            ${v.cliente_nome ? `<strong>${escapeHtml(v.cliente_nome)}</strong><br>` : ''}
            <span style="color: var(--text-muted);">Op: ${escapeHtml(v.operador_nome || 'Admin')}</span>
          </td>
          <td>
            ${badgePag}
            ${cancelada ? `<br><span class="badge badge-danger" style="font-size:0.68rem; margin-top:3px;">ESTORNADA</span>` : ''}
          </td>
          <td style="text-align: right;" class="tabular-nums">${formatBRL(custo)}</td>
          <td style="text-align: right; font-weight: 800;" class="tabular-nums">${formatBRL(vendaVal)}</td>
          <td style="text-align: right; font-size: 0.82rem;" class="tabular-nums">${detalheCobrado}</td>
          <td style="text-align: right; font-weight: 700; color: ${lucro >= 0 ? '#059669' : '#DC2626'};" class="tabular-nums">
            ${lucro >= 0 ? '+' : ''}${formatBRL(lucro)}
          </td>
          <td style="text-align: right;">
            ${!cancelada
              ? `<button type="button" class="btn btn-outline btn-sm" style="color: #DC2626; border-color: #FCA5A5; font-size: 0.74rem; padding: 0.2rem 0.5rem;" onclick="estornarVendaCantina(${v.id})">Estornar</button>`
              : `<span style="font-size: 0.75rem; color: var(--text-muted);">Cancelada</span>`
            }
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Erro ao carregar histórico de vendas:', err);
  }
};

window.estornarVendaCantina = async function(vendaId) {
  if (!confirm(`Deseja realmente estornar/cancelar a venda #${vendaId}? Os produtos serão devolvidos automaticamente ao estoque.`)) {
    return;
  }

  try {
    await API.request(`/admin/cantina/vendas/${vendaId}/estornar`, { method: 'POST' });
    showToast(`Venda #${vendaId} estornada e estoque atualizado!`, 'success');
    await Promise.all([
      carregarProdutosCantina(),
      carregarFinanceiroCantina(),
      carregarHistoricoVendasCantina()
    ]);
  } catch (err) {
    showToast(err.message || 'Erro ao estornar venda.', 'error');
  }
};

// ==============================================================
// Exportação de Relatórios (CSV e Impressão/PDF)
// ==============================================================
window.exportarRelatorioVendasCSV = function() {
  if (!vendasHistoricoCache || vendasHistoricoCache.length === 0) {
    showToast('Nenhuma venda para exportar.', 'warning');
    return;
  }

  const headers = [
    'ID Venda',
    'Data/Hora',
    'Status',
    'Forma Pagamento',
    'Itens',
    'Cliente',
    'Operador',
    'Custo Total (R$)',
    'Valor Venda Liquido (R$)',
    'Taxa Maquina (%)',
    'Valor Cobrado Maquina (R$)',
    'Lucro da Venda (R$)'
  ];

  const rows = vendasHistoricoCache.map(v => {
    const dt = v.created_at ? new Date(v.created_at).toLocaleString('pt-BR') : '';
    const itensStr = (v.itens || []).map(i => `${i.quantidade}x ${i.produto_nome}`).join(' | ');
    const custo = Number(v.valor_custo_total || 0);
    const venda = Number(v.valor_subtotal || 0);
    const lucro = venda - custo;

    return [
      v.id,
      dt,
      v.status,
      v.forma_pagamento,
      itensStr,
      v.cliente_nome || '',
      v.operador_nome || '',
      custo.toFixed(2).replace('.', ','),
      venda.toFixed(2).replace('.', ','),
      Number(v.taxa_cartao_percentual || 0).toFixed(2).replace('.', ','),
      Number(v.valor_total_cobrado || 0).toFixed(2).replace('.', ','),
      lucro.toFixed(2).replace('.', ',')
    ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(';');
  });

  const csvContent = '\ufeff' + [headers.join(';'), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `relatorio_vendas_cantina_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

window.exportarRelatorioProdutosCSV = function() {
  const prods = dadosFinanceirosCache?.relatorio_produtos || [];
  if (prods.length === 0) {
    showToast('Nenhum dado de produto para exportar.', 'warning');
    return;
  }

  const headers = [
    'Produto',
    'Categoria',
    'Qtd Vendida',
    'Qtd em Estoque',
    'Custo Unitario (R$)',
    'Preco Venda (R$)',
    'Custo Total Investido (R$)',
    'Custo dos Vendidos (R$)',
    'Total Vendido (R$)',
    'Lucro sobre Vendidos (R$)',
    'Saldo c/ Estoque (R$)'
  ];

  const rows = prods.map(p => [
    p.nome,
    p.categoria,
    p.qtd_vendida,
    p.quantidade_estoque,
    Number(p.valor_custo_unitario).toFixed(2).replace('.', ','),
    Number(p.preco_venda_unitario).toFixed(2).replace('.', ','),
    Number(p.custo_total_investido).toFixed(2).replace('.', ','),
    Number(p.custo_vendido).toFixed(2).replace('.', ','),
    Number(p.receita_vendida).toFixed(2).replace('.', ','),
    Number(p.lucro_sobre_vendidos).toFixed(2).replace('.', ','),
    Number(p.saldo_investimento_produto).toFixed(2).replace('.', ',')
  ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(';'));

  const csvContent = '\ufeff' + [headers.join(';'), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `relatorio_produtos_cantina_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

window.imprimirRelatorioFinanceiroCantina = function() {
  if (!dadosFinanceirosCache || !dadosFinanceirosCache.resumo) {
    showToast('Carregue os dados financeiros antes de imprimir.', 'warning');
    return;
  }

  const r = dadosFinanceirosCache.resumo;
  const fp = dadosFinanceirosCache.por_forma_pagamento || {};
  const prods = dadosFinanceirosCache.relatorio_produtos || [];

  const win = window.open('', '_blank');
  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Relatório Financeiro da Cantina - UMP Eventos</title>
      <style>
        body { font-family: Arial, sans-serif; color: #0f172a; padding: 24px; }
        h1 { margin: 0 0 4px 0; font-size: 22px; color: #00363A; }
        p.sub { margin: 0 0 20px 0; font-size: 12px; color: #64748b; }
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
        .box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; background: #f8fafc; }
        .box-label { font-size: 11px; text-transform: uppercase; color: #475569; font-weight: bold; }
        .box-val { font-size: 18px; font-weight: bold; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; margin-bottom: 24px; }
        th, td { border: 1px solid #cbd5e1; padding: 7px 8px; text-align: left; }
        th { background: #f1f5f9; font-weight: bold; }
        .right { text-align: right; }
        .center { text-align: center; }
      </style>
    </head>
    <body>
      <h1>Relatório Financeiro & Estoque da Cantina</h1>
      <p class="sub">Gerado em: ${new Date().toLocaleString('pt-BR')} | Total de Pedidos Concluídos: ${r.total_pedidos}</p>

      <div class="grid">
        <div class="box">
          <div class="box-label">Custo Total Investido</div>
          <div class="box-val">${formatBRL(r.custo_total_investido)}</div>
          <div style="font-size:11px; color:#64748b;">Vendido: ${formatBRL(r.custo_itens_vendidos)} | Estoque: ${formatBRL(r.custo_estoque_atual)}</div>
        </div>
        <div class="box">
          <div class="box-label">Total Vendido (Líquido)</div>
          <div class="box-val">${formatBRL(r.receita_vendas_liquida)}</div>
          <div style="font-size:11px; color:#64748b;">Cobrado c/ taxas: ${formatBRL(r.receita_total_cobrada)}</div>
        </div>
        <div class="box">
          <div class="box-label">Lucro s/ Itens Vendidos</div>
          <div class="box-val">${formatBRL(r.lucro_sobre_vendidos)}</div>
          <div style="font-size:11px; color:#64748b;">Margem real: ${Number(r.margem_real_vendidos).toFixed(1)}%</div>
        </div>
        <div class="box">
          <div class="box-label">Saldo Final (Vendas - Custo Total)</div>
          <div class="box-val">${formatBRL(r.saldo_sobre_investimento_total)}</div>
          <div style="font-size:11px; color:#64748b;">Recuperado: ${Number(r.percentual_recuperacao_investimento).toFixed(1)}%</div>
        </div>
      </div>

      <h3>1. Resumo por Forma de Pagamento</h3>
      <table>
        <thead>
          <tr>
            <th>Forma de Pagamento</th>
            <th class="center">Qtd. Pedidos</th>
            <th class="right">Receita Líquida (Produtos)</th>
            <th class="right">Total Cobrado (c/ Taxa Máquina)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>PIX</td>
            <td class="center">${fp.PIX?.quantidade_pedidos || 0}</td>
            <td class="right">${formatBRL(fp.PIX?.valor_liquido || 0)}</td>
            <td class="right">${formatBRL(fp.PIX?.valor_cobrado || 0)}</td>
          </tr>
          <tr>
            <td>Dinheiro</td>
            <td class="center">${fp.DINHEIRO?.quantidade_pedidos || 0}</td>
            <td class="right">${formatBRL(fp.DINHEIRO?.valor_liquido || 0)}</td>
            <td class="right">${formatBRL(fp.DINHEIRO?.valor_cobrado || 0)}</td>
          </tr>
          <tr>
            <td>Cartão</td>
            <td class="center">${fp.CARTAO?.quantidade_pedidos || 0}</td>
            <td class="right">${formatBRL(fp.CARTAO?.valor_liquido || 0)}</td>
            <td class="right">${formatBRL(fp.CARTAO?.valor_cobrado || 0)}</td>
          </tr>
        </tbody>
      </table>

      <h3>2. Desempenho por Produto</h3>
      <table>
        <thead>
          <tr>
            <th>Produto</th>
            <th class="center">Vendidos</th>
            <th class="center">Estoque</th>
            <th class="right">Custo Unit.</th>
            <th class="right">Preço Venda</th>
            <th class="right">Custo Total</th>
            <th class="right">Total Vendido</th>
            <th class="right">Lucro s/ Vendidos</th>
          </tr>
        </thead>
        <tbody>
          ${prods.map(p => `
            <tr>
              <td>${escapeHtml(p.nome)}</td>
              <td class="center">${p.qtd_vendida}</td>
              <td class="center">${p.quantidade_estoque}</td>
              <td class="right">${formatBRL(p.valor_custo_unitario)}</td>
              <td class="right">${formatBRL(p.preco_venda_unitario)}</td>
              <td class="right">${formatBRL(p.custo_total_investido)}</td>
              <td class="right">${formatBRL(p.receita_vendida)}</td>
              <td class="right">${formatBRL(p.lucro_sobre_vendidos)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </body>
    </html>
  `;

  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 400);
};

