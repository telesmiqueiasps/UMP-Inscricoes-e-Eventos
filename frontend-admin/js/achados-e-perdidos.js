// ==========================================
// Gestão de Achados e Perdidos - Admin UMP
// ==========================================

let itensAchadosCache = [];
let statusFiltroAtual = 'TODOS';
let eventosCache = [];

// Ícones SVG Vetoriais (Zero Emojis - Diretrizes AGENTS.md)
const ICONS = {
  checkCircle: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  alertTriangle: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  mapPin: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  calendar: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  tag: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><circle cx="7" cy="7" r=".5" fill="currentColor"/></svg>`,
  user: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  phone: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  message: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>`,
  edit: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
  trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
  zoom: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!API.getToken()) {
    window.location.href = 'index.html';
    return;
  }

  await carregarEventosSelect();
  await carregarAchadosAdmin();
});

window.logoutAdmin = function () {
  API.clearToken();
  window.location.href = 'index.html';
};

// --- Carregar Lista de Eventos ---
async function carregarEventosSelect() {
  try {
    const evs = await API.request('/admin/eventos');
    eventosCache = evs || [];

    const selFiltro = document.getElementById('filtro-evento');
    const selForm = document.getElementById('achado-evento-id');

    if (selFiltro) {
      selFiltro.innerHTML = '<option value="">Todos os Eventos</option>' +
        eventosCache.map(e => `<option value="${e.id}">${escapeHtml(e.titulo)}</option>`).join('');
    }

    if (selForm) {
      selForm.innerHTML = '<option value="">Geral / Sem Evento Vinculado</option>' +
        eventosCache.map(e => `<option value="${e.id}">${escapeHtml(e.titulo)}</option>`).join('');
    }
  } catch (err) {
    console.error('Erro ao carregar eventos:', err);
  }
}

// --- Carregar Achados e Perdidos ---
window.carregarAchadosAdmin = async function () {
  const container = document.getElementById('achados-grid-container');
  if (container) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
        Atualizando itens de achados e perdidos...
      </div>
    `;
  }

  const evId = document.getElementById('filtro-evento')?.value || '';
  let url = `/admin/achados-perdidos?status=${encodeURIComponent(statusFiltroAtual)}`;
  if (evId) url += `&evento_id=${encodeURIComponent(evId)}`;

  try {
    const list = await API.request(url);
    itensAchadosCache = list || [];

    atualizarKPIs(itensAchadosCache);
    filtrarCardsLocalmente();
  } catch (err) {
    if (container) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 2.5rem 1rem; color: #DC2626;">
          <p><strong>Erro ao carregar achados e perdidos:</strong> ${escapeHtml(err.message || 'Falha de comunicação')}</p>
          <button class="btn btn-outline" onclick="carregarAchadosAdmin()" style="margin-top: 0.5rem;">Tentar Novamente</button>
        </div>
      `;
    }
  }
};

// --- Atualizar Contadores / KPIs ---
function atualizarKPIs(itens) {
  const total = itens.length;
  let disp = 0;
  let reiv = 0;
  let entr = 0;

  itens.forEach(it => {
    const st = (it.status || '').toUpperCase();
    if (st === 'DISPONIVEL') disp++;
    else if (st === 'REIVINDICADO') reiv++;
    else if (st === 'ENTREGUE') entr++;
  });

  const elTot = document.getElementById('kpi-total');
  const elDisp = document.getElementById('kpi-disponivel');
  const elReiv = document.getElementById('kpi-reivindicado');
  const elEntr = document.getElementById('kpi-entregue');

  if (elTot) elTot.textContent = total;
  if (elDisp) elDisp.textContent = disp;
  if (elReiv) elReiv.textContent = reiv;
  if (elEntr) elEntr.textContent = entr;
}

// --- Alternar Filtro por Status ---
window.filtrarStatusAdmin = function (status, btnElement) {
  statusFiltroAtual = status;
  document.querySelectorAll('.achados-tab-btn').forEach(btn => btn.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');
  carregarAchadosAdmin();
};

// --- Filtrar Cards Localmente por Busca ---
window.filtrarCardsLocalmente = function () {
  const termo = (document.getElementById('filtro-busca')?.value || '').toLowerCase().trim();
  let itensFiltrados = itensAchadosCache;

  if (termo) {
    itensFiltrados = itensAchadosCache.filter(it => {
      const tit = (it.titulo || '').toLowerCase();
      const desc = (it.descricao || '').toLowerCase();
      const loc = (it.local_encontrado || '').toLowerCase();
      const ev = (it.evento_nome || '').toLowerCase();
      const part = (it.reivindicado_por?.nome || '').toLowerCase();
      return tit.includes(termo) || desc.includes(termo) || loc.includes(termo) || ev.includes(termo) || part.includes(termo);
    });
  }

  renderizarCardsAchados(itensFiltrados);
};

// --- Renderizar Cards de Achados ---
function renderizarCardsAchados(itens) {
  const container = document.getElementById('achados-grid-container');
  if (!container) return;

  if (!itens || itens.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1.5rem; background: #FFFFFF; border-radius: 14px; border: 1px dashed var(--border-color);">
        <div style="width: 54px; height: 54px; border-radius: 50%; background: #F1F5F9; color: #64748B; display: flex; align-items: center; justify-content: center; margin: 0 auto 0.75rem auto;">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>
        </div>
        <h3 style="font-weight: 800; font-size: 1.15rem; color: var(--text-dark); margin: 0 0 0.35rem 0;">Nenhum item encontrado</h3>
        <p style="color: var(--text-muted); font-size: 0.88rem; margin: 0 0 1rem 0;">Nenhum achado corresponde aos filtros atuais.</p>
        <button type="button" class="btn-novo-item" onclick="abrirModalNovoAchado()">
          <span>Cadastrar Primeiro Item</span>
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = itens.map(it => {
    const st = (it.status || 'DISPONIVEL').toUpperCase();
    let badgeClass = 'status-disponivel';
    let badgeText = 'Aguardando Dono';

    if (st === 'REIVINDICADO') {
      badgeClass = 'status-reivindicado';
      badgeText = 'Reivindicado (Entregar)';
    } else if (st === 'ENTREGUE') {
      badgeClass = 'status-entregue';
      badgeText = 'Entregue';
    }

    const fotoUrl = it.foto_url || 'img/logo.png';

    // Bloco de Reivindicação (se o participante marcou)
    let blocoReivindicacao = '';
    if (st === 'REIVINDICADO' && it.reivindicado_por) {
      const part = it.reivindicado_por;
      blocoReivindicacao = `
        <div class="box-reivindicacao">
          <div class="box-reivindicacao-title">
            ${ICONS.user}
            <span>Reivindicado por Participante</span>
          </div>
          <div><strong>Nome:</strong> ${escapeHtml(part.nome)}</div>
          ${part.telefone ? `<div><strong>Contato:</strong> ${escapeHtml(part.telefone)}</div>` : ''}
          ${it.reivindicacao_mensagem ? `<div style="margin-top: 3px; font-style: italic; background: rgba(255,255,255,0.7); padding: 4px 6px; border-radius: 4px;">"${escapeHtml(it.reivindicacao_mensagem)}"</div>` : ''}
        </div>
      `;
    }

    // Bloco de Entrega (se entregue)
    let blocoEntrega = '';
    if (st === 'ENTREGUE') {
      blocoEntrega = `
        <div class="box-entrega-feita">
          <div class="box-entrega-title">
            ${ICONS.checkCircle}
            <span>Entrega Realizada</span>
          </div>
          <div><strong>Recebido por:</strong> ${escapeHtml(it.entregue_para_nome || 'Participante')}</div>
          ${it.entregue_por_nome ? `<div><strong>Entregue por:</strong> ${escapeHtml(it.entregue_por_nome)}</div>` : ''}
          ${it.entregue_observacao ? `<div style="font-size: 0.78rem; color: #64748B; margin-top: 2px;">Obs: ${escapeHtml(it.entregue_observacao)}</div>` : ''}
        </div>
      `;
    }

    // Ações do footer
    let botoesAcao = '';
    if (st === 'REIVINDICADO') {
      botoesAcao = `
        <button type="button" class="btn-entregar-item" onclick="abrirModalEntrega(${it.id})">
          ${ICONS.checkCircle}
          <span>Marcar Entregue</span>
        </button>
        <button type="button" class="btn-rejeitar-reivindicacao" onclick="rejeitarReivindicacaoAdmin(${it.id})" title="Liberar item caso o participante não seja o dono">
          <span>Liberar Item</span>
        </button>
      `;
    } else if (st === 'DISPONIVEL') {
      botoesAcao = `
        <button type="button" class="btn-entregar-item" onclick="abrirModalEntrega(${it.id})">
          ${ICONS.checkCircle}
          <span>Entregar Item</span>
        </button>
      `;
    } else if (st === 'ENTREGUE') {
      botoesAcao = `
        <button type="button" class="btn-desfazer-entrega" onclick="desfazerEntregaAdmin(${it.id})" title="Desfazer entrega e voltar status">
          <span>Desfazer Entrega</span>
        </button>
      `;
    }

    return `
      <div class="achado-card" id="achado-card-${it.id}">
        <div class="achado-card-thumb" onclick="abrirLightbox('${escapeHtml(fotoUrl)}')">
          <span class="achado-status-badge ${badgeClass}">${badgeText}</span>
          <img src="${escapeHtml(fotoUrl)}" alt="${escapeHtml(it.titulo)}" onerror="this.src='img/logo.png'">
          <div class="achado-thumb-overlay">
            ${ICONS.zoom}
            <span>Ampliar Foto</span>
          </div>
        </div>

        <div class="achado-card-body">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
            <h3 class="achado-card-title">${escapeHtml(it.titulo)}</h3>
            <span class="badge" style="background: #F1F5F9; color: #475569; font-size: 0.7rem; font-weight: 700; white-space: nowrap;">
              ${escapeHtml(it.evento_nome || 'Geral')}
            </span>
          </div>

          <div class="achado-meta-row">
            ${it.local_encontrado ? `
              <div class="achado-meta-item">
                ${ICONS.mapPin}
                <span><strong>Local:</strong> ${escapeHtml(it.local_encontrado)}</span>
              </div>
            ` : ''}
            ${it.data_encontrado ? `
              <div class="achado-meta-item">
                ${ICONS.calendar}
                <span><strong>Quando:</strong> ${escapeHtml(it.data_encontrado)}</span>
              </div>
            ` : ''}
          </div>

          ${it.descricao ? `
            <div class="achado-card-desc">${escapeHtml(it.descricao)}</div>
          ` : ''}

          ${blocoReivindicacao}
          ${blocoEntrega}
        </div>

        <div class="achado-card-footer">
          <div style="display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;">
            ${botoesAcao}
          </div>

          <div style="display: flex; gap: 0.35rem; align-items: center; margin-left: auto;">
            <button type="button" class="btn btn-outline" style="padding: 0.38rem 0.6rem; font-size: 0.75rem;" onclick="abrirModalEditarAchado(${it.id})" title="Editar Item">
              ${ICONS.edit}
            </button>
            <button type="button" class="btn btn-outline" style="padding: 0.38rem 0.6rem; font-size: 0.75rem; color: #EF4444; border-color: #FECDD3;" onclick="excluirAchadoAdmin(${it.id}, '${escapeHtml(it.titulo)}')" title="Excluir Item">
              ${ICONS.trash}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// --- Upload de Foto com Câmera ou Arquivo ---
window.processarUploadFotoAchado = async function (inputElement) {
  const file = inputElement.files[0];
  if (!file) return;

  const spinner = document.getElementById('upload-spinner');
  const placeholder = document.getElementById('uploader-placeholder');
  const preview = document.getElementById('preview-foto-achado');

  if (placeholder) placeholder.style.display = 'none';
  if (spinner) spinner.style.display = 'block';

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await API.request('/admin/achados-perdidos/upload', {
      method: 'POST',
      body: formData
    });

    document.getElementById('achado-foto-url').value = res.url;
    document.getElementById('achado-foto-url-input').value = res.url;

    if (preview) {
      preview.src = res.url;
      preview.style.display = 'block';
    }
    showToast('Foto enviada com sucesso para o Supabase Storage!', 'success');
  } catch (err) {
    showToast(err.message || 'Erro ao enviar foto.', 'error');
    if (placeholder) placeholder.style.display = 'block';
    if (preview) preview.style.display = 'none';
  } finally {
    if (spinner) spinner.style.display = 'none';
    inputElement.value = '';
  }
};

window.atualizarUrlManualFoto = function (url) {
  const preview = document.getElementById('preview-foto-achado');
  const placeholder = document.getElementById('uploader-placeholder');
  const hidden = document.getElementById('achado-foto-url');

  const clean = (url || '').trim();
  hidden.value = clean;

  if (clean) {
    if (placeholder) placeholder.style.display = 'none';
    if (preview) {
      preview.src = clean;
      preview.style.display = 'block';
    }
  } else {
    if (placeholder) placeholder.style.display = 'block';
    if (preview) preview.style.display = 'none';
  }
};

// --- Modal de Cadastro / Edição ---
window.abrirModalNovoAchado = function () {
  document.getElementById('form-achado').reset();
  document.getElementById('achado-id').value = '';
  document.getElementById('achado-foto-url').value = '';
  document.getElementById('modal-achado-titulo').innerHTML = `
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF7900" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>
    <span>Cadastrar Item Encontrado</span>
  `;

  const preview = document.getElementById('preview-foto-achado');
  const placeholder = document.getElementById('uploader-placeholder');
  if (preview) {
    preview.src = '';
    preview.style.display = 'none';
  }
  if (placeholder) placeholder.style.display = 'block';

  // Selecionar evento atualmente filtrado por padrão
  const evAtual = document.getElementById('filtro-evento')?.value;
  if (evAtual) {
    const selForm = document.getElementById('achado-evento-id');
    if (selForm) selForm.value = evAtual;
  }

  document.getElementById('modal-achado').style.display = 'flex';
};

window.abrirModalEditarAchado = function (id) {
  const item = itensAchadosCache.find(it => it.id === id);
  if (!item) return;

  document.getElementById('achado-id').value = item.id;
  document.getElementById('achado-titulo').value = item.titulo || '';
  document.getElementById('achado-evento-id').value = item.evento_id || '';
  document.getElementById('achado-local').value = item.local_encontrado || '';
  document.getElementById('achado-data').value = item.data_encontrado || '';
  document.getElementById('achado-descricao').value = item.descricao || '';
  document.getElementById('achado-foto-url').value = item.foto_url || '';
  document.getElementById('achado-foto-url-input').value = item.foto_url || '';

  const preview = document.getElementById('preview-foto-achado');
  const placeholder = document.getElementById('uploader-placeholder');
  if (item.foto_url) {
    if (preview) {
      preview.src = item.foto_url;
      preview.style.display = 'block';
    }
    if (placeholder) placeholder.style.display = 'none';
  } else {
    if (preview) preview.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
  }

  document.getElementById('modal-achado-titulo').innerHTML = `
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF7900" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
    <span>Editar Item Encontrado</span>
  `;

  document.getElementById('modal-achado').style.display = 'flex';
};

window.fecharModalAchado = function () {
  document.getElementById('modal-achado').style.display = 'none';
};

// --- Salvar Item (Novo ou Edição) ---
window.salvarAchadoAdmin = async function (e) {
  e.preventDefault();

  const id = document.getElementById('achado-id').value;
  const fotoUrl = document.getElementById('achado-foto-url').value.trim();
  const titulo = document.getElementById('achado-titulo').value.trim();
  const evVal = document.getElementById('achado-evento-id').value;
  const local = document.getElementById('achado-local').value.trim();
  const data = document.getElementById('achado-data').value.trim();
  const descricao = document.getElementById('achado-descricao').value.trim();

  if (!fotoUrl) {
    showToast('Por favor, tire uma foto ou selecione uma imagem do item.', 'warning');
    return;
  }

  const payload = {
    titulo,
    evento_id: evVal ? parseInt(evVal, 10) : null,
    local_encontrado: local || null,
    data_encontrado: data || null,
    descricao: descricao || null,
    foto_url: fotoUrl
  };

  const btnSalvar = document.getElementById('btn-salvar-achado');
  const txtOriginal = btnSalvar.innerHTML;
  btnSalvar.disabled = true;
  btnSalvar.innerHTML = '<span>Salvando...</span>';

  try {
    if (id) {
      await API.request(`/admin/achados-perdidos/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast('Item atualizado com sucesso!', 'success');
    } else {
      await API.request('/admin/achados-perdidos', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast('Item cadastrado com sucesso!', 'success');
    }

    fecharModalAchado();
    await carregarAchadosAdmin();
  } catch (err) {
    showToast(err.message || 'Erro ao salvar item.', 'error');
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.innerHTML = txtOriginal;
  }
};

// --- Excluir Item ---
window.excluirAchadoAdmin = async function (id, titulo) {
  if (!confirm(`Tem certeza que deseja excluir o item "${titulo}"? Esta ação removerá a foto do sistema.`)) {
    return;
  }

  try {
    await API.request(`/admin/achados-perdidos/${id}`, { method: 'DELETE' });
    showToast('Item excluído com sucesso!', 'success');
    await carregarAchadosAdmin();
  } catch (err) {
    showToast(err.message || 'Erro ao excluir item.', 'error');
  }
};

// --- Modal de Confirmação de Entrega ---
window.abrirModalEntrega = function (id) {
  const item = itensAchadosCache.find(it => it.id === id);
  if (!item) return;

  document.getElementById('entrega-item-id').value = item.id;
  document.getElementById('entrega-thumb').src = item.foto_url || 'img/logo.png';
  document.getElementById('entrega-item-titulo').textContent = item.titulo;

  // Pré-preencher com o nome do reivindicante se houver
  const nomeReiv = item.reivindicado_por ? item.reivindicado_por.nome : '';
  document.getElementById('entrega-para-nome').value = nomeReiv;
  document.getElementById('entrega-observacao').value = '';

  document.getElementById('modal-entrega').style.display = 'flex';
};

window.fecharModalEntrega = function () {
  document.getElementById('modal-entrega').style.display = 'none';
};

window.salvarConfirmacaoEntrega = async function (e) {
  e.preventDefault();

  const id = document.getElementById('entrega-item-id').value;
  const entreguePara = document.getElementById('entrega-para-nome').value.trim();
  const obs = document.getElementById('entrega-observacao').value.trim();

  try {
    const res = await API.request(`/admin/achados-perdidos/${id}/entregar`, {
      method: 'POST',
      body: JSON.stringify({
        entregue_para_nome: entreguePara,
        entregue_observacao: obs || null
      })
    });

    showToast(res.mensagem || 'Item marcado como entregue com sucesso!', 'success');
    fecharModalEntrega();
    await carregarAchadosAdmin();
  } catch (err) {
    showToast(err.message || 'Erro ao confirmar entrega.', 'error');
  }
};

// --- Desfazer Entrega ---
window.desfazerEntregaAdmin = async function (id) {
  if (!confirm('Deseja desfazer a marcação de entrega deste item?')) return;

  try {
    const res = await API.request(`/admin/achados-perdidos/${id}/desfazer-entrega`, { method: 'POST' });
    showToast(res.mensagem || 'Entrega desfeita com sucesso.', 'info');
    await carregarAchadosAdmin();
  } catch (err) {
    showToast(err.message || 'Erro ao desfazer entrega.', 'error');
  }
};

// --- Rejeitar Reivindicação / Liberar Item ---
window.rejeitarReivindicacaoAdmin = async function (id) {
  if (!confirm('Deseja liberar este item e cancelar a reivindicação do participante? O item voltará a ficar disponível para todos.')) {
    return;
  }

  try {
    const res = await API.request(`/admin/achados-perdidos/${id}/rejeitar-reivindicacao`, { method: 'POST' });
    showToast(res.mensagem || 'Reivindicação cancelada e item liberado.', 'info');
    await carregarAchadosAdmin();
  } catch (err) {
    showToast(err.message || 'Erro ao cancelar reivindicação.', 'error');
  }
};

// --- Lightbox de Imagem ---
window.abrirLightbox = function (url) {
  const lb = document.getElementById('modal-lightbox');
  const img = document.getElementById('lightbox-img');
  if (lb && img) {
    img.src = url;
    lb.style.display = 'flex';
  }
};

window.fecharLightbox = function (e) {
  if (e.target.id === 'modal-lightbox') {
    document.getElementById('modal-lightbox').style.display = 'none';
  }
};

// --- Utilitário de Escape ---
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
