let produtosCantina = [];
let carrinhoPDV = {}; // { [produtoId]: quantidade }
let categoriaAtivaPDV = 'TODAS';
let formaPagamentoPDV = 'PIX';
let configCantina = {
  taxa_maquina_cartao: 0.0,
  modo_calculo_taxa: 'REPASSE'
};
let caixaAbertoAtual = null;
let listaCaixasCache = [];
let filtroCaixaFinanceiroId = ''; // '' = Consolidado Geral, ou ID numérico do caixa
let dadosFinanceirosCache = null;
let vendasHistoricoCache = [];

// Ícones SVG Reutilizáveis (Zero Emojis)
const SVG_ICONS = {
  produtoFallback: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  produtoThumb: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  imagemPreview: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
  alerta: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  checkCircle: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  editar: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
  excluir: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
  pix: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 3px;"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/></svg>`,
  dinheiro: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 3px;"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/></svg>`,
  cartao: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 3px;"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
  cadeadoAberto: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`,
  cadeadoFechado: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  movimentar: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="m17 5-5-3-5 3"/><path d="m17 19-5 3-5-3"/></svg>`,
  impressora: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>`,
  olho: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`
};

function formatBRL(val) {
  const num = Number(val || 0);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarDataRef(dataStr) {
  if (!dataStr) return '-';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
    const [y, m, d] = dataStr.split('-');
    return `${d}/${m}/${y}`;
  }
  return dataStr;
}

function obterDataHojeInput() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
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
    carregarCaixaAtualCantina(),
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

  await carregarCaixaAtualCantina();

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
// Gestão de Sessões de Caixa (Abrir, Movimentar, Fechar, Reabrir)
// ==============================================================
async function carregarCaixaAtualCantina() {
  try {
    const res = await API.request('/admin/cantina/caixas');
    caixaAbertoAtual = res?.caixa_aberto || null;
    listaCaixasCache = Array.isArray(res?.caixas) ? res.caixas : [];
    renderizarBarraCaixaAtual();
  } catch (err) {
    console.warn('Erro ao carregar status do caixa:', err);
  }
}

function renderizarBarraCaixaAtual() {
  const strip = document.getElementById('caixa-status-strip');
  const btnFinAbrir = document.getElementById('btn-fin-abrir-caixa');
  if (!strip) return;

  if (btnFinAbrir) {
    btnFinAbrir.style.display = caixaAbertoAtual ? 'none' : 'inline-flex';
  }

  if (caixaAbertoAtual) {
    strip.className = 'caixa-status-strip aberto';
    const dtFmt = formatarDataRef(caixaAbertoAtual.data_referencia);
    strip.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.85rem; flex-wrap: wrap;">
        <div style="width: 42px; height: 42px; border-radius: 12px; background: #DCFCE7; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          ${SVG_ICONS.cadeadoAberto}
        </div>
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <span class="badge badge-success" style="font-size: 0.72rem; font-weight: 800; letter-spacing: 0.04em;">CAIXA ABERTO #${caixaAbertoAtual.id}</span>
            <strong style="font-size: 1rem; color: #064E3B;">${escapeHtml(caixaAbertoAtual.descricao)}</strong>
            <span style="font-size: 0.82rem; color: #047857; font-weight: 700;">&bull; Data Ref: ${escapeHtml(dtFmt)}</span>
          </div>
          <div style="font-size: 0.78rem; color: #065F46; margin-top: 0.15rem;">
            Aberto por <strong>${escapeHtml(caixaAbertoAtual.aberto_por_nome || 'Operador')}</strong> — Todas as vendas estão sendo gravadas neste caixa
          </div>
        </div>
      </div>

      <div class="caixa-kpis-inline">
        <div class="caixa-kpi-pill">
          <span>Fundo Inicial</span>
          <strong class="tabular-nums">${formatBRL(caixaAbertoAtual.valor_inicial)}</strong>
        </div>
        <div class="caixa-kpi-pill">
          <span>Vendas no Caixa (${caixaAbertoAtual.total_pedidos})</span>
          <strong class="tabular-nums" style="color: #2563EB;">${formatBRL(caixaAbertoAtual.receita_liquida_total)}</strong>
        </div>
        <div class="caixa-kpi-pill" style="border-color: #86EFAC; background: #F0FDF4;">
          <span>Dinheiro na Gaveta</span>
          <strong class="tabular-nums" style="color: #059669;">${formatBRL(caixaAbertoAtual.saldo_dinheiro_gaveta)}</strong>
        </div>

        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button type="button" class="btn btn-outline btn-sm" onclick="abrirModalMovimentarCaixa()" style="height: 38px; background: #FFFFFF; border-color: #86EFAC; color: #065F46; font-weight: 700; display: inline-flex; align-items: center; gap: 0.35rem;">
            ${SVG_ICONS.movimentar}
            <span>Suprimento / Sangria</span>
          </button>
          <button type="button" class="btn btn-danger btn-sm" onclick="abrirModalFecharCaixa()" style="height: 38px; font-weight: 700; display: inline-flex; align-items: center; gap: 0.35rem;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <span>Fechar Caixa</span>
          </button>
        </div>
      </div>
    `;
  } else {
    strip.className = 'caixa-status-strip fechado';
    strip.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.85rem; flex-wrap: wrap;">
        <div style="width: 42px; height: 42px; border-radius: 12px; background: #FEF3C7; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          ${SVG_ICONS.cadeadoFechado}
        </div>
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <span class="badge badge-warning" style="font-size: 0.72rem; font-weight: 800;">CAIXA FECHADO</span>
            <strong style="font-size: 0.98rem; color: #78350F;">Nenhum caixa aberto no momento</strong>
          </div>
          <div style="font-size: 0.8rem; color: #92400E; margin-top: 0.15rem;">
            Abra um caixa informando a data e o valor inicial de troco para registrar todas as vendas do dia sem erros de fuso horário.
          </div>
        </div>
      </div>

      <div>
        <button type="button" class="btn-esmeralda-acao" onclick="abrirModalAbrirCaixa()">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
          <span>Abrir Caixa do Dia</span>
        </button>
      </div>
    `;
  }
}

window.abrirModalAbrirCaixa = function() {
  if (caixaAbertoAtual) {
    showToast('Já existe um caixa aberto no momento.', 'warning');
    return;
  }
  const form = document.getElementById('form-abrir-caixa');
  if (form) form.reset();
  const dataInput = document.getElementById('caixa-abrir-data');
  if (dataInput) dataInput.value = obterDataHojeInput();

  const descInput = document.getElementById('caixa-abrir-descricao');
  if (descInput) {
    const proximoNum = (listaCaixasCache?.length || 0) + 1;
    descInput.value = `Caixa Dia ${proximoNum}`;
  }

  const valInput = document.getElementById('caixa-abrir-valor-inicial');
  if (valInput) valInput.value = '0.00';

  document.getElementById('modal-abrir-caixa').style.display = 'flex';
};

window.fecharModalAbrirCaixa = function() {
  document.getElementById('modal-abrir-caixa').style.display = 'none';
};

window.confirmarAberturaCaixa = async function(e) {
  e.preventDefault();
  const dataRef = document.getElementById('caixa-abrir-data')?.value;
  const descricao = document.getElementById('caixa-abrir-descricao')?.value.trim();
  const valorInicial = parseFloat(document.getElementById('caixa-abrir-valor-inicial')?.value || '0') || 0;
  const obs = document.getElementById('caixa-abrir-obs')?.value.trim();

  if (!dataRef) {
    showToast('Informe a data de referência do caixa.', 'warning');
    return;
  }

  try {
    const res = await API.request('/admin/cantina/caixas/abrir', {
      method: 'POST',
      body: JSON.stringify({
        data_referencia: dataRef,
        descricao: descricao || null,
        valor_inicial: valorInicial,
        observacao_abertura: obs || null,
        vincular_vendas_sem_caixa: true
      })
    });

    showToast(res.mensagem || 'Caixa aberto com sucesso!', 'success');
    fecharModalAbrirCaixa();
    await carregarCaixaAtualCantina();

    const paneFin = document.getElementById('pane-financeiro');
    if (paneFin && paneFin.classList.contains('active')) {
      await Promise.all([carregarFinanceiroCantina(), carregarHistoricoVendasCantina()]);
    }
  } catch (err) {
    showToast(err.message || 'Erro ao abrir caixa.', 'error');
  }
};

window.abrirModalMovimentarCaixa = function() {
  if (!caixaAbertoAtual) {
    showToast('Abra um caixa antes de registrar movimentações.', 'warning');
    return;
  }
  const form = document.getElementById('form-movimentar-caixa');
  if (form) form.reset();
  renderizarListaMovimentacoesModal();
  document.getElementById('modal-movimentar-caixa').style.display = 'flex';
};

window.fecharModalMovimentarCaixa = function() {
  document.getElementById('modal-movimentar-caixa').style.display = 'none';
};

function renderizarListaMovimentacoesModal() {
  const container = document.getElementById('lista-movimentacoes-modal');
  if (!container) return;

  const movs = caixaAbertoAtual?.movimentacoes || [];
  if (movs.length === 0) {
    container.innerHTML = `<p style="text-align: center; color: var(--text-muted); font-size: 0.82rem; margin: 0.75rem 0;">Nenhuma movimentação manual registrada neste caixa.</p>`;
    return;
  }

  container.innerHTML = movs.map(m => {
    const isSup = m.tipo === 'SUPRIMENTO';
    const dt = m.created_at ? new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.45rem 0; border-bottom: 1px dashed #E2E8F0; font-size: 0.82rem;">
        <div>
          <span class="badge ${isSup ? 'badge-success' : 'badge-danger'}" style="font-size: 0.68rem;">${isSup ? '+ SUPRIMENTO' : '- SANGRIA'}</span>
          <strong style="margin-left: 0.35rem; color: var(--text-main);">${escapeHtml(m.motivo || '')}</strong>
          <small style="color: var(--text-muted); margin-left: 0.35rem;">${dt}</small>
        </div>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <strong class="tabular-nums" style="color: ${isSup ? '#059669' : '#DC2626'};">${isSup ? '+' : '-'}${formatBRL(m.valor)}</strong>
          <button type="button" class="btn btn-outline btn-sm" style="padding: 0.15rem 0.4rem; color: #DC2626; border-color: #FCA5A5;" title="Remover lançamento" onclick="excluirMovimentacaoCaixa(${m.id})">
            ${SVG_ICONS.excluir}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

window.salvarMovimentacaoCaixa = async function(e) {
  e.preventDefault();
  if (!caixaAbertoAtual) return;

  const tipo = document.getElementById('mov-caixa-tipo')?.value;
  const valor = parseFloat(document.getElementById('mov-caixa-valor')?.value || '0');
  const motivo = document.getElementById('mov-caixa-motivo')?.value.trim();

  if (!valor || valor <= 0) {
    showToast('Informe um valor válido maior que zero.', 'warning');
    return;
  }

  try {
    const res = await API.request(`/admin/cantina/caixas/${caixaAbertoAtual.id}/movimentacoes`, {
      method: 'POST',
      body: JSON.stringify({ tipo, valor, motivo })
    });
    caixaAbertoAtual = res.caixa;
    showToast(res.mensagem || 'Movimentação registrada!', 'success');
    document.getElementById('form-movimentar-caixa')?.reset();
    renderizarBarraCaixaAtual();
    renderizarListaMovimentacoesModal();

    const paneFin = document.getElementById('pane-financeiro');
    if (paneFin && paneFin.classList.contains('active')) {
      await carregarFinanceiroCantina();
    }
  } catch (err) {
    showToast(err.message || 'Erro ao registrar movimentação.', 'error');
  }
};

window.excluirMovimentacaoCaixa = async function(movId) {
  if (!confirm('Deseja remover este lançamento de suprimento/sangria?')) return;
  try {
    await API.request(`/admin/cantina/movimentacoes/${movId}`, { method: 'DELETE' });
    showToast('Movimentação removida.', 'success');
    await carregarCaixaAtualCantina();
    renderizarListaMovimentacoesModal();

    const paneFin = document.getElementById('pane-financeiro');
    if (paneFin && paneFin.classList.contains('active')) {
      await carregarFinanceiroCantina();
    }
  } catch (err) {
    showToast(err.message || 'Erro ao remover movimentação.', 'error');
  }
};

window.abrirModalFecharCaixa = async function(caixaIdOpcional) {
  await carregarCaixaAtualCantina();
  const alvo = caixaIdOpcional
    ? listaCaixasCache.find(c => c.id === Number(caixaIdOpcional))
    : caixaAbertoAtual;

  if (!alvo) {
    showToast('Nenhum caixa aberto para fechar.', 'warning');
    return;
  }

  const box = document.getElementById('fechar-caixa-resumo-box');
  const titulo = document.getElementById('fechar-caixa-titulo-modal');
  if (titulo) {
    titulo.textContent = `Fechar Caixa #${alvo.id} — ${alvo.descricao} (${formatarDataRef(alvo.data_referencia)})`;
  }

  if (box) {
    box.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.65rem; font-size: 0.84rem; margin-bottom: 0.85rem;">
        <div>
          <span style="color: #94A3B8; display: block; font-size: 0.74rem;">Fundo Inicial de Troco</span>
          <strong class="tabular-nums" style="font-size: 1rem;">${formatBRL(alvo.valor_inicial)}</strong>
        </div>
        <div>
          <span style="color: #94A3B8; display: block; font-size: 0.74rem;">(+) Vendas em Dinheiro</span>
          <strong class="tabular-nums" style="font-size: 1rem; color: #34D399;">+${formatBRL(alvo.vendas_dinheiro)}</strong>
        </div>
        <div>
          <span style="color: #94A3B8; display: block; font-size: 0.74rem;">(+) Suprimentos / (-) Sangrias</span>
          <strong class="tabular-nums" style="font-size: 0.92rem;">+${formatBRL(alvo.total_suprimentos)} / -${formatBRL(alvo.total_sangrias)}</strong>
        </div>
        <div>
          <span style="color: #94A3B8; display: block; font-size: 0.74rem;">Vendas PIX & Cartão (Líq.)</span>
          <strong class="tabular-nums" style="font-size: 0.92rem;">PIX: ${formatBRL(alvo.vendas_pix)} | Cartão: ${formatBRL(alvo.vendas_cartao_liquido)}</strong>
        </div>
      </div>
      <div style="padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.16); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
        <div>
          <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #FFD166; font-weight: 800;">Saldo Esperado em Dinheiro na Gaveta</div>
          <small style="color: #CBD5E1; font-size: 0.74rem;">Total geral vendido no caixa: ${formatBRL(alvo.receita_liquida_total)} (${alvo.total_pedidos} pedidos)</small>
        </div>
        <strong class="tabular-nums" style="font-size: 1.5rem; color: #34D399;">${formatBRL(alvo.saldo_dinheiro_gaveta)}</strong>
      </div>
    `;
  }

  const inputContado = document.getElementById('caixa-fechar-valor-contado');
  if (inputContado) {
    inputContado.value = Number(alvo.saldo_dinheiro_gaveta || 0).toFixed(2);
    inputContado.dataset.caixaId = alvo.id;
    inputContado.dataset.saldoEsperado = alvo.saldo_dinheiro_gaveta || 0;
  }
  const inputObs = document.getElementById('caixa-fechar-obs');
  if (inputObs) inputObs.value = '';

  atualizarDiferencaFechamentoModal();
  document.getElementById('modal-fechar-caixa').style.display = 'flex';
};

window.fecharModalFecharCaixa = function() {
  document.getElementById('modal-fechar-caixa').style.display = 'none';
};

window.atualizarDiferencaFechamentoModal = function() {
  const inputContado = document.getElementById('caixa-fechar-valor-contado');
  const feedback = document.getElementById('caixa-fechar-diferenca-feedback');
  if (!inputContado || !feedback) return;

  const esperado = parseFloat(inputContado.dataset.saldoEsperado || '0') || 0;
  const contadoRaw = inputContado.value;
  if (contadoRaw === '' || isNaN(parseFloat(contadoRaw))) {
    feedback.textContent = '';
    return;
  }

  const contado = parseFloat(contadoRaw);
  const diff = Math.round((contado - esperado) * 100) / 100;
  if (Math.abs(diff) < 0.01) {
    feedback.textContent = 'Gaveta conferida: valor bate exatamente com o saldo esperado!';
    feedback.style.color = '#059669';
  } else if (diff > 0) {
    feedback.textContent = `Sobra em caixa: +${formatBRL(diff)} acima do esperado.`;
    feedback.style.color = '#2563EB';
  } else {
    feedback.textContent = `Diferença (Falta na gaveta): ${formatBRL(diff)} em relação ao esperado.`;
    feedback.style.color = '#DC2626';
  }
};

window.confirmarFechamentoCaixa = async function(e) {
  e.preventDefault();
  const inputContado = document.getElementById('caixa-fechar-valor-contado');
  const caixaId = inputContado?.dataset.caixaId || caixaAbertoAtual?.id;
  if (!caixaId) return;

  const valorInformado = inputContado?.value !== '' ? parseFloat(inputContado.value) : null;
  const obs = document.getElementById('caixa-fechar-obs')?.value.trim() || null;

  try {
    const res = await API.request(`/admin/cantina/caixas/${caixaId}/fechar`, {
      method: 'POST',
      body: JSON.stringify({
        valor_fechamento_informado: valorInformado,
        observacao_fechamento: obs
      })
    });

    showToast(res.mensagem || 'Caixa fechado com sucesso!', 'success');
    fecharModalFecharCaixa();
    await carregarCaixaAtualCantina();

    const paneFin = document.getElementById('pane-financeiro');
    if (paneFin && paneFin.classList.contains('active')) {
      await Promise.all([carregarFinanceiroCantina(), carregarHistoricoVendasCantina()]);
    }
  } catch (err) {
    showToast(err.message || 'Erro ao fechar o caixa.', 'error');
  }
};

window.reabrirCaixaCantina = async function(caixaId) {
  if (!confirm(`Deseja reabrir o Caixa #${caixaId} para continuar registrando vendas nele?`)) return;
  try {
    const res = await API.request(`/admin/cantina/caixas/${caixaId}/reabrir`, { method: 'POST' });
    showToast(res.mensagem || 'Caixa reaberto com sucesso!', 'success');
    await carregarCaixaAtualCantina();
    await Promise.all([carregarFinanceiroCantina(), carregarHistoricoVendasCantina()]);
  } catch (err) {
    showToast(err.message || 'Erro ao reabrir o caixa.', 'error');
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

window.substituirImgPorSvgFallback = function(imgEl) {
  if (!imgEl || !imgEl.parentElement) return;
  imgEl.style.display = 'none';
  if (!imgEl.parentElement.querySelector('.svg-fallback-icon')) {
    const span = document.createElement('span');
    span.className = 'svg-fallback-icon';
    span.style.display = 'inline-flex';
    span.innerHTML = SVG_ICONS.produtoFallback;
    imgEl.parentElement.appendChild(span);
  }
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
        <div style="color: #64748B; margin-bottom: 0.65rem; display: flex; justify-content: center;">${SVG_ICONS.produtoFallback}</div>
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
      ? `<img src="${escapeHtml(p.imagem_url)}" alt="${escapeHtml(p.nome)}" onerror="substituirImgPorSvgFallback(this)">`
      : `<span class="svg-fallback-icon" style="display:inline-flex;">${SVG_ICONS.produtoFallback}</span>`;

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
  if (!caixaAbertoAtual) {
    showToast('Abra um caixa do dia antes de registrar vendas no PDV.', 'warning');
    abrirModalAbrirCaixa();
    return;
  }

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
    caixa_id: caixaAbertoAtual.id,
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
  const originalText = btn ? btn.innerHTML : `${SVG_ICONS.checkCircle}<span>Finalizar Venda</span>`;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" style="display:inline-block; width:16px; height:16px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite;"></span><span>Registrando venda...</span>`;
  }

  try {
    const venda = await API.request('/admin/cantina/vendas', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    let msgSucesso = `Venda #${venda.id} concluída no Caixa #${caixaAbertoAtual.id} (${formatBRL(venda.valor_subtotal)})!`;
    if (formaPagamentoPDV === 'DINHEIRO' && Number(venda.valor_troco) > 0) {
      msgSucesso += ` Troco: ${formatBRL(venda.valor_troco)}`;
    } else if (formaPagamentoPDV === 'CARTAO') {
      msgSucesso += ` Cobrado na máquina: ${formatBRL(venda.valor_total_cobrado)}`;
    }

    showToast(msgSucesso, 'success');
    limparCarrinhoPDV();
    await Promise.all([
      carregarProdutosCantina(),
      carregarCaixaAtualCantina()
    ]);
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
      : `<div style="width: 38px; height: 38px; border-radius: 8px; background: #F1F5F9; color: #64748B; display: flex; align-items: center; justify-content: center;">${SVG_ICONS.produtoThumb}</div>`;

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
          <button type="button" class="btn btn-outline btn-sm" style="padding: 0.25rem 0.55rem; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 0.3rem;" onclick="abrirModalEditarProduto(${p.id})">
            ${SVG_ICONS.editar}
            <span>Editar</span>
          </button>
          <button type="button" class="btn btn-danger btn-sm" style="padding: 0.25rem 0.55rem; font-size: 0.78rem; display: inline-flex; align-items: center;" title="Excluir produto" onclick="excluirProdutoCantina(${p.id})">
            ${SVG_ICONS.excluir}
          </button>
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

window.mostrarErroPreviewImg = function(imgEl) {
  if (!imgEl || !imgEl.parentElement) return;
  imgEl.parentElement.innerHTML = SVG_ICONS.alerta;
};

window.atualizarPreviewImagemProduto = function() {
  const url = (document.getElementById('prod-imagem-url')?.value || '').trim();
  const box = document.getElementById('prod-img-preview-box');
  if (!box) return;

  if (!url) {
    box.innerHTML = SVG_ICONS.imagemPreview;
    return;
  }

  box.innerHTML = `<img src="${escapeHtml(url)}" style="width: 100%; height: 100%; object-fit: cover;" onerror="mostrarErroPreviewImg(this)">`;
};

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
// Aba 3: Financeiro, Caixas & Relatórios (Por Caixa ou Consolidado)
// ==============================================================
window.aoMudarFiltroCaixaFinanceiro = async function() {
  const sel = document.getElementById('fin-filtro-caixa-select');
  filtroCaixaFinanceiroId = sel ? sel.value : '';
  await Promise.all([
    carregarFinanceiroCantina(),
    carregarHistoricoVendasCantina()
  ]);
};

window.selecionarCaixaNoFinanceiro = async function(caixaId) {
  filtroCaixaFinanceiroId = caixaId ? String(caixaId) : '';
  const sel = document.getElementById('fin-filtro-caixa-select');
  if (sel) sel.value = filtroCaixaFinanceiroId;
  await Promise.all([
    carregarFinanceiroCantina(),
    carregarHistoricoVendasCantina()
  ]);
};

async function carregarFinanceiroCantina() {
  try {
    let url = '/admin/cantina/financeiro';
    if (filtroCaixaFinanceiroId !== '') {
      url += `?caixa_id=${encodeURIComponent(filtroCaixaFinanceiroId)}`;
    }
    const data = await API.request(url);
    dadosFinanceirosCache = data;
    listaCaixasCache = Array.isArray(data?.caixas) ? data.caixas : [];
    renderizarSeletorCaixasFinanceiro(listaCaixasCache);
    renderizarDashboardFinanceiro(data);
    renderizarTabelaCaixasFinanceiro(listaCaixasCache);
  } catch (err) {
    console.error('Erro ao carregar financeiro da cantina:', err);
  }
}

function renderizarSeletorCaixasFinanceiro(caixas) {
  const sel = document.getElementById('fin-filtro-caixa-select');
  if (!sel) return;

  const opcoes = [
    `<option value="">Consolidado Geral — Todos os Caixas (${caixas.length} ${caixas.length === 1 ? 'caixa' : 'caixas'})</option>`
  ];

  caixas.forEach(c => {
    const dt = formatarDataRef(c.data_referencia);
    const statusTxt = c.status === 'ABERTO' ? 'ABERTO' : 'FECHADO';
    opcoes.push(
      `<option value="${c.id}">Caixa #${c.id} — ${escapeHtml(dt)} — ${escapeHtml(c.descricao)} [${statusTxt}] (${formatBRL(c.receita_liquida_total)})</option>`
    );
  });

  sel.innerHTML = opcoes.join('');
  sel.value = filtroCaixaFinanceiroId ? String(filtroCaixaFinanceiroId) : '';
}

function renderizarTabelaCaixasFinanceiro(caixas) {
  const tbody = document.getElementById('fin-caixas-table-body');
  if (!tbody) return;

  if (!caixas || caixas.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 1.75rem;">
          Nenhum caixa foi aberto ainda. Clique em <strong>Abrir Caixa do Dia</strong> para iniciar o controle por sessão.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = caixas.map(c => {
    const isAberto = c.status === 'ABERTO';
    const isSelecionado = String(filtroCaixaFinanceiroId) === String(c.id);
    const dtRef = formatarDataRef(c.data_referencia);

    return `
      <tr style="${isSelecionado ? 'background: #F0FDF4;' : ''}">
        <td>
          <div style="display: flex; align-items: center; gap: 0.45rem;">
            <strong style="color: var(--text-main);">#${c.id} &bull; ${escapeHtml(c.descricao)}</strong>
            ${isSelecionado ? `<span class="badge badge-success" style="font-size: 0.65rem;">Selecionado</span>` : ''}
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">
            Data Ref: <strong>${escapeHtml(dtRef)}</strong> | Op: ${escapeHtml(c.aberto_por_nome || 'Admin')}
          </div>
        </td>
        <td>
          <span class="badge ${isAberto ? 'badge-success' : ''}" style="${!isAberto ? 'background:#F1F5F9; color:#475569;' : ''}">
            ${isAberto ? 'ABERTO' : 'FECHADO'}
          </span>
          <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.15rem;">${c.total_pedidos} pedidos</div>
        </td>
        <td style="text-align: right;" class="tabular-nums">${formatBRL(c.valor_inicial)}</td>
        <td style="text-align: right; font-weight: 800; color: #2563EB;" class="tabular-nums">${formatBRL(c.receita_liquida_total)}</td>
        <td style="text-align: right; font-size: 0.76rem; color: var(--text-muted);" class="tabular-nums">
          Din: ${formatBRL(c.vendas_dinheiro)}<br>
          PIX: ${formatBRL(c.vendas_pix)} | Cart: ${formatBRL(c.vendas_cartao_liquido)}
        </td>
        <td style="text-align: right; font-weight: 800; color: #004C50;" class="tabular-nums">
          ${formatBRL(c.saldo_dinheiro_gaveta)}
          ${c.valor_fechamento_informado !== null ? `<div style="font-size:0.7rem; color:#64748B;">Contado: ${formatBRL(c.valor_fechamento_informado)}</div>` : ''}
        </td>
        <td style="text-align: right; font-weight: 700; color: ${c.lucro_bruto_caixa >= 0 ? '#059669' : '#DC2626'};" class="tabular-nums">
          ${c.lucro_bruto_caixa >= 0 ? '+' : ''}${formatBRL(c.lucro_bruto_caixa)}
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <button type="button" class="btn ${isSelecionado ? 'btn-primary' : 'btn-outline'} btn-sm" style="padding: 0.25rem 0.55rem; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 0.3rem;" onclick="selecionarCaixaNoFinanceiro(${c.id})">
            ${SVG_ICONS.olho}
            <span>${isSelecionado ? 'Filtrado' : 'Relatório'}</span>
          </button>
          <button type="button" class="btn btn-outline btn-sm" style="padding: 0.25rem 0.55rem; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 0.3rem;" title="Imprimir fechamento deste caixa" onclick="imprimirRelatorioCaixaEspecifico(${c.id})">
            ${SVG_ICONS.impressora}
          </button>
          ${isAberto
            ? `<button type="button" class="btn btn-danger btn-sm" style="padding: 0.25rem 0.55rem; font-size: 0.75rem;" onclick="abrirModalFecharCaixa(${c.id})">Fechar</button>`
            : (!caixaAbertoAtual ? `<button type="button" class="btn btn-outline btn-sm" style="padding: 0.25rem 0.55rem; font-size: 0.75rem;" onclick="reabrirCaixaCantina(${c.id})">Reabrir</button>` : '')
          }
        </td>
      </tr>
    `;
  }).join('');
}

window.imprimirRelatorioCaixaEspecifico = async function(caixaId) {
  await selecionarCaixaNoFinanceiro(caixaId);
  imprimirRelatorioFinanceiroCantina();
};

function renderizarDashboardFinanceiro(data) {
  if (!data || !data.resumo) return;
  const r = data.resumo;
  const cxSel = data.caixa_selecionado || null;
  const gaveta = data.resumo_gaveta || {};

  // Badge de Escopo no card superior
  const escopoBadge = document.getElementById('fin-escopo-badge');
  const labelCustoCard = document.getElementById('fin-label-custo-card');
  if (cxSel) {
    if (escopoBadge) {
      escopoBadge.textContent = `RELATÓRIO ESPECÍFICO — CAIXA #${cxSel.id}: ${cxSel.descricao.toUpperCase()} (${formatarDataRef(cxSel.data_referencia)}) [${cxSel.status}]`;
    }
    if (labelCustoCard) {
      labelCustoCard.textContent = 'Custo dos Itens Vendidos Neste Caixa';
    }
  } else {
    if (escopoBadge) {
      escopoBadge.textContent = 'CONSOLIDADO GERAL DA CANTINA (TODOS OS CAIXAS DO EVENTO)';
    }
    if (labelCustoCard) {
      labelCustoCard.textContent = 'Custo Total Investido (Estoque + Vendidos)';
    }
  }

  // 1. Cards principais
  document.getElementById('fin-custo-total-investido').textContent = formatBRL(r.custo_total_investido);
  if (cxSel) {
    document.getElementById('fin-detalhe-custo').textContent = `Custo dos produtos saídos no Caixa #${cxSel.id}`;
  } else {
    document.getElementById('fin-detalhe-custo').textContent = `Vendido: ${formatBRL(r.custo_itens_vendidos)} | Em estoque: ${formatBRL(r.custo_estoque_atual)}`;
  }

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
    elSaldoLeg.textContent = cxSel ? 'Lucro líquido apurado neste caixa' : 'Lucro líquido após pagar 100% do estoque';
  } else {
    elSaldo.textContent = formatBRL(r.saldo_sobre_investimento_total);
    elSaldo.style.color = '#D97706';
    elSaldoLeg.textContent = `Faltam ${formatBRL(r.falta_para_empatar)} para cobrir todo o estoque`;
  }

  // 2. Barra de Ponto de Equilíbrio (Break-Even)
  const pct = Math.min(100, Math.max(0, Number(r.percentual_recuperacao_investimento || 0)));
  document.getElementById('fin-progress-bar').style.width = `${pct}%`;
  document.getElementById('fin-progress-label').textContent = `${Number(r.percentual_recuperacao_investimento || 0).toFixed(1).replace('.', ',')}% do custo recuperado`;

  const tituloStatus = document.getElementById('fin-status-titulo');
  const valorBreakeven = document.getElementById('fin-breakeven-valor');

  if (cxSel) {
    tituloStatus.textContent = `${cxSel.descricao} (${formatarDataRef(cxSel.data_referencia)}) — Vendido: ${formatBRL(r.receita_vendas_liquida)} | Lucro: ${formatBRL(r.lucro_sobre_vendidos)}`;
    valorBreakeven.textContent = `Gaveta em espécie: ${formatBRL(gaveta.saldo_dinheiro_gaveta || 0)}`;
    valorBreakeven.style.color = '#34D399';
  } else if (r.custo_total_investido === 0 && r.receita_vendas_liquida === 0) {
    tituloStatus.textContent = 'Aguardando movimentação da cantina';
    valorBreakeven.textContent = 'Sem custos/vendas registrados';
  } else if (r.saldo_sobre_investimento_total >= 0) {
    tituloStatus.textContent = `Ponto de Equilíbrio Atingido — Lucro Líquido Consolidado: ${formatBRL(r.lucro_caixa_apos_estoque)}`;
    valorBreakeven.textContent = `Estoque 100% pago + ${formatBRL(r.lucro_caixa_apos_estoque)} de lucro livre`;
    valorBreakeven.style.color = '#34D399';
  } else {
    tituloStatus.textContent = `Faltam ${formatBRL(r.falta_para_empatar)} em vendas para cobrir todo o estoque comprado`;
    valorBreakeven.textContent = `Já vendido: ${formatBRL(r.receita_vendas_liquida)} de ${formatBRL(r.custo_total_investido)} investidos`;
    valorBreakeven.style.color = '#FFD166';
  }

  // 3. Conferência de Gaveta (Dinheiro Físico)
  const gavTitulo = document.getElementById('fin-gaveta-titulo');
  if (gavTitulo) {
    gavTitulo.textContent = cxSel
      ? `Conferência de Gaveta — Caixa #${cxSel.id} (${cxSel.descricao})`
      : 'Conferência de Dinheiro em Espécie (Soma de Todos os Caixas)';
  }
  document.getElementById('fin-gaveta-inicial').textContent = formatBRL(gaveta.valor_inicial || 0);
  document.getElementById('fin-gaveta-vendas-din').textContent = `+${formatBRL(gaveta.vendas_dinheiro || 0)}`;
  document.getElementById('fin-gaveta-suprimentos').textContent = `+${formatBRL(gaveta.total_suprimentos || 0)}`;
  document.getElementById('fin-gaveta-sangrias').textContent = `-${formatBRL(gaveta.total_sangrias || 0)}`;
  document.getElementById('fin-gaveta-saldo').textContent = formatBRL(gaveta.saldo_dinheiro_gaveta || 0);

  const confInfo = document.getElementById('fin-gaveta-conferencia-info');
  if (confInfo) {
    if (cxSel && cxSel.valor_fechamento_informado !== null) {
      const diff = Number(cxSel.diferenca_fechamento || 0);
      const diffStr = Math.abs(diff) < 0.01 ? 'Bateu exato' : (diff > 0 ? `Sobra +${formatBRL(diff)}` : `Falta ${formatBRL(diff)}`);
      confInfo.textContent = `Contado no fechamento: ${formatBRL(cxSel.valor_fechamento_informado)} (${diffStr})`;
    } else {
      confInfo.textContent = 'Inicial + Vendas em Dinheiro + Suprimentos - Sangrias';
    }
  }

  // 4. Formas de Pagamento
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

  // 5. Tabela de Relatório por Produto
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
  if (filtroCaixaFinanceiroId !== '') {
    url += `&caixa_id=${encodeURIComponent(filtroCaixaFinanceiroId)}`;
  }
  if (forma) url += `&forma_pagamento=${encodeURIComponent(forma)}`;
  if (busca) url += `&search=${encodeURIComponent(busca)}`;

  try {
    const vendas = await API.request(url);
    vendasHistoricoCache = Array.isArray(vendas) ? vendas : [];

    if (vendasHistoricoCache.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Nenhuma venda registrada com os filtros selecionados.</td></tr>`;
      return;
    }

    const mapaCaixas = {};
    (listaCaixasCache || []).forEach(c => {
      mapaCaixas[c.id] = c;
    });

    tbody.innerHTML = vendasHistoricoCache.map(v => {
      const cancelada = v.status === 'CANCELADA';
      const dt = v.created_at ? new Date(v.created_at).toLocaleString('pt-BR') : '-';
      const cx = v.caixa_id ? mapaCaixas[v.caixa_id] : null;
      const labelCaixa = cx
        ? `Caixa #${cx.id} (${formatarDataRef(cx.data_referencia)})`
        : (v.caixa_id ? `Caixa #${v.caixa_id}` : 'Sem Caixa');

      const itensTexto = (v.itens || []).map(it => `${it.quantidade}x ${escapeHtml(it.produto_nome)}`).join(', ');
      const custo = Number(v.valor_custo_total || 0);
      const vendaVal = Number(v.valor_subtotal || 0);
      const lucro = vendaVal - custo;

      let badgePag = `<span class="badge badge-success">${SVG_ICONS.pix}PIX</span>`;
      let detalheCobrado = formatBRL(v.valor_total_cobrado);

      if (v.forma_pagamento === 'DINHEIRO') {
        badgePag = `<span class="badge badge-warning">${SVG_ICONS.dinheiro}Dinheiro</span>`;
        if (Number(v.valor_troco || 0) > 0) {
          detalheCobrado = `Rec: ${formatBRL(v.valor_recebido_dinheiro)}<br><small style="color:#059669;">Troco: ${formatBRL(v.valor_troco)}</small>`;
        }
      } else if (v.forma_pagamento === 'CARTAO') {
        badgePag = `<span class="badge" style="background:#EFF6FF; color:#2563EB;">${SVG_ICONS.cartao}Cartão (${Number(v.taxa_cartao_percentual || 0).toFixed(2).replace('.', ',')}%)</span>`;
        detalheCobrado = `<strong>${formatBRL(v.valor_total_cobrado)}</strong><br><small style="color:var(--text-muted);">Taxa: +${formatBRL(v.valor_taxa_cartao)}</small>`;
      }

      return `
        <tr style="${cancelada ? 'opacity: 0.52; text-decoration: line-through;' : ''}">
          <td class="tabular-nums">
            <strong>#${v.id}</strong>
            <span class="badge" style="background:#F1F5F9; color:#004C50; font-size:0.68rem; margin-left:4px;">${escapeHtml(labelCaixa)}</span>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">${dt}</div>
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
      carregarCaixaAtualCantina(),
      carregarProdutosCantina(),
      carregarFinanceiroCantina(),
      carregarHistoricoVendasCantina()
    ]);
  } catch (err) {
    showToast(err.message || 'Erro ao estornar venda.', 'error');
  }
};

// ==============================================================
// Exportação de Relatórios (CSV e Impressão/PDF — Por Caixa ou Consolidado)
// ==============================================================
window.exportarRelatorioVendasCSV = function() {
  if (!vendasHistoricoCache || vendasHistoricoCache.length === 0) {
    showToast('Nenhuma venda para exportar neste escopo.', 'warning');
    return;
  }

  const mapaCaixas = {};
  (listaCaixasCache || []).forEach(c => {
    mapaCaixas[c.id] = c;
  });

  const headers = [
    'ID Venda',
    'Caixa ID',
    'Data Referencia Caixa',
    'Descricao Caixa',
    'Data/Hora Registro',
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
    const cx = v.caixa_id ? mapaCaixas[v.caixa_id] : null;
    const itensStr = (v.itens || []).map(i => `${i.quantidade}x ${i.produto_nome}`).join(' | ');
    const custo = Number(v.valor_custo_total || 0);
    const venda = Number(v.valor_subtotal || 0);
    const lucro = venda - custo;

    return [
      v.id,
      v.caixa_id || '',
      cx ? formatarDataRef(cx.data_referencia) : '',
      cx ? cx.descricao : '',
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

  const sufixo = filtroCaixaFinanceiroId ? `caixa_${filtroCaixaFinanceiroId}` : 'consolidado';
  const csvContent = '\ufeff' + [headers.join(';'), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `relatorio_vendas_cantina_${sufixo}_${new Date().toISOString().slice(0, 10)}.csv`;
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
    'Escopo Relatorio',
    'Produto',
    'Categoria',
    'Qtd Vendida',
    'Qtd em Estoque Atual',
    'Custo Unitario (R$)',
    'Preco Venda (R$)',
    'Custo Apurado (R$)',
    'Custo dos Vendidos (R$)',
    'Total Vendido (R$)',
    'Lucro sobre Vendidos (R$)',
    'Saldo Resultado (R$)'
  ];

  const cxSel = dadosFinanceirosCache?.caixa_selecionado;
  const escopoStr = cxSel
    ? `Caixa #${cxSel.id} - ${cxSel.descricao} (${formatarDataRef(cxSel.data_referencia)})`
    : 'Consolidado Geral (Todos os Caixas)';

  const rows = prods.map(p => [
    escopoStr,
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

  const sufixo = filtroCaixaFinanceiroId ? `caixa_${filtroCaixaFinanceiroId}` : 'consolidado';
  const csvContent = '\ufeff' + [headers.join(';'), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `relatorio_produtos_cantina_${sufixo}_${new Date().toISOString().slice(0, 10)}.csv`;
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
  const cxSel = dadosFinanceirosCache.caixa_selecionado;
  const gaveta = dadosFinanceirosCache.resumo_gaveta || {};
  const fp = dadosFinanceirosCache.por_forma_pagamento || {};
  const prods = dadosFinanceirosCache.relatorio_produtos || [];

  const tituloEscopo = cxSel
    ? `Fechamento de Caixa #${cxSel.id} — ${escapeHtml(cxSel.descricao)} (Data Ref: ${escapeHtml(formatarDataRef(cxSel.data_referencia))})`
    : `Relatório Consolidado Geral — Todos os Caixas (${(dadosFinanceirosCache.caixas || []).length} caixas)`;

  const win = window.open('', '_blank');
  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>${tituloEscopo} - Cantina UMP Eventos</title>
      <style>
        body { font-family: Arial, sans-serif; color: #0f172a; padding: 24px; }
        h1 { margin: 0 0 4px 0; font-size: 20px; color: #00363A; }
        h2 { margin: 0 0 12px 0; font-size: 14px; color: #EA580C; }
        p.sub { margin: 0 0 18px 0; font-size: 12px; color: #64748b; }
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
        .box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; background: #f8fafc; }
        .box-label { font-size: 10px; text-transform: uppercase; color: #475569; font-weight: bold; }
        .box-val { font-size: 16px; font-weight: bold; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; margin-bottom: 20px; }
        th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
        th { background: #f1f5f9; font-weight: bold; }
        .right { text-align: right; }
        .center { text-align: center; }
      </style>
    </head>
    <body>
      <h1>Relatório Financeiro & Fechamento da Cantina</h1>
      <h2>${tituloEscopo}</h2>
      <p class="sub">Emitido em: ${new Date().toLocaleString('pt-BR')} | Total de Pedidos Concluídos: ${r.total_pedidos} (${r.total_itens_vendidos} itens)</p>

      <div class="grid">
        <div class="box">
          <div class="box-label">${cxSel ? 'Custo dos Itens Vendidos' : 'Custo Total Investido'}</div>
          <div class="box-val">${formatBRL(r.custo_total_investido)}</div>
          <div style="font-size:10px; color:#64748b;">Vendido: ${formatBRL(r.custo_itens_vendidos)} | Estoque: ${formatBRL(r.custo_estoque_atual)}</div>
        </div>
        <div class="box">
          <div class="box-label">Total Vendido (Líquido)</div>
          <div class="box-val">${formatBRL(r.receita_vendas_liquida)}</div>
          <div style="font-size:10px; color:#64748b;">Cobrado c/ taxas: ${formatBRL(r.receita_total_cobrada)}</div>
        </div>
        <div class="box">
          <div class="box-label">Lucro s/ Itens Vendidos</div>
          <div class="box-val">${formatBRL(r.lucro_sobre_vendidos)}</div>
          <div style="font-size:10px; color:#64748b;">Margem real: ${Number(r.margem_real_vendidos).toFixed(1)}%</div>
        </div>
        <div class="box">
          <div class="box-label">Saldo em Dinheiro na Gaveta</div>
          <div class="box-val">${formatBRL(gaveta.saldo_dinheiro_gaveta || 0)}</div>
          <div style="font-size:10px; color:#64748b;">Inicial: ${formatBRL(gaveta.valor_inicial || 0)} | Din: ${formatBRL(gaveta.vendas_dinheiro || 0)}</div>
        </div>
      </div>

      <h3>1. Conferência de Gaveta (Dinheiro Físico)</h3>
      <table>
        <thead>
          <tr>
            <th class="right">Fundo Inicial</th>
            <th class="right">(+) Vendas em Dinheiro</th>
            <th class="right">(+) Suprimentos</th>
            <th class="right">(-) Sangrias</th>
            <th class="right">(=) Saldo Esperado em Gaveta</th>
            ${cxSel && cxSel.valor_fechamento_informado !== null ? `<th class="right">Valor Contado</th><th class="right">Diferença</th>` : ''}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="right">${formatBRL(gaveta.valor_inicial || 0)}</td>
            <td class="right">${formatBRL(gaveta.vendas_dinheiro || 0)}</td>
            <td class="right">${formatBRL(gaveta.total_suprimentos || 0)}</td>
            <td class="right">${formatBRL(gaveta.total_sangrias || 0)}</td>
            <td class="right"><strong>${formatBRL(gaveta.saldo_dinheiro_gaveta || 0)}</strong></td>
            ${cxSel && cxSel.valor_fechamento_informado !== null ? `<td class="right">${formatBRL(cxSel.valor_fechamento_informado)}</td><td class="right">${formatBRL(cxSel.diferenca_fechamento || 0)}</td>` : ''}
          </tr>
        </tbody>
      </table>

      <h3>2. Resumo por Forma de Pagamento</h3>
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

      <h3>3. Desempenho por Produto</h3>
      <table>
        <thead>
          <tr>
            <th>Produto</th>
            <th class="center">Vendidos</th>
            <th class="center">Estoque Atual</th>
            <th class="right">Custo Unit.</th>
            <th class="right">Preço Venda</th>
            <th class="right">Custo Vendido</th>
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
              <td class="right">${formatBRL(p.custo_vendido)}</td>
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


// ==============================================================
// ATALHOS DO CARDÁPIO PÚBLICO PARA PARTICIPANTES
// ==============================================================
function obterUrlCardapioPublico() {
  const origin = window.location.origin;
  const path = window.location.pathname || '';
  if (path.includes('/frontend-admin/')) {
    return `${origin}/frontend-public/cantina.html`;
  }
  return `${origin}/cantina.html`;
}

window.abrirCardapioPublico = function() {
  window.open(obterUrlCardapioPublico(), '_blank');
};

window.copiarLinkCardapioPublico = async function() {
  const url = obterUrlCardapioPublico();
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      showToast('Link do cardápio público copiado!', 'success');
    } else {
      prompt('Copie o link do cardápio público:', url);
    }
  } catch (err) {
    prompt('Copie o link do cardápio público:', url);
  }
};
