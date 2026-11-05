
// Controle do Menu Mobile (Drawer 3 tracinhos)
window.toggleMenuMobile = function () {
  const sidebar = document.getElementById('main-sidebar');
  const backdrop = document.getElementById('mobile-menu-backdrop');
  if (!sidebar) return;
  const isOpen = sidebar.classList.toggle('menu-open');
  if (backdrop) {
    if (isOpen) backdrop.classList.add('active');
    else backdrop.classList.remove('active');
  }
};

window.fecharMenuMobile = function () {
  const sidebar = document.getElementById('main-sidebar');
  const backdrop = document.getElementById('mobile-menu-backdrop');
  if (sidebar) sidebar.classList.remove('menu-open');
  if (backdrop) backdrop.classList.remove('active');
};

// Troca de Abas do Participante
window.switchTab = function (tabId) {
  if (typeof window.fecharMenuMobile === 'function') {
    window.fecharMenuMobile();
  }

  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  const target = document.getElementById(tabId);
  if (target) target.style.display = 'block';

  document.querySelectorAll('.sidebar-link').forEach(el => el.classList.remove('active'));
  if (tabId === 'tab-painel') {
    const el = document.getElementById('menu-painel');
    if (el) el.classList.add('active');
  } else if (tabId === 'tab-eventos') {
    const el = document.getElementById('menu-eventos');
    if (el) el.classList.add('active');
  } else if (tabId === 'tab-oficinas') {
    const el = document.getElementById('menu-oficinas');
    if (el) el.classList.add('active');
    if (typeof window.carregarOficinasParticipante === 'function') {
      window.carregarOficinasParticipante();
    }
  } else if (tabId === 'tab-senha') {
    const el = document.getElementById('menu-senha');
    if (el) el.classList.add('active');
  }
};


let currentDashboardData = null;
let activeEventKey = null; // Ex: "ins_12" ou "tr_5"

// Elementos Globais
let welcomeUser, userInfoCard, registrationCard, paymentsContainer;

document.addEventListener('DOMContentLoaded', async () => {
  const token = API.getToken();
  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  welcomeUser = document.getElementById('welcome-user');
  userInfoCard = document.getElementById('user-info-card');
  registrationCard = document.getElementById('registration-card');
  paymentsContainer = document.getElementById('payments-container');

  // 1. Verificar se o participante acabou de retornar do checkout da InfinitePay
  const urlParams = new URLSearchParams(window.location.search);
  const orderNsu = urlParams.get('order_nsu') || urlParams.get('external_order_nsu');
  const txNsu = urlParams.get('transaction_nsu') || urlParams.get('id');
  const slug = urlParams.get('slug') || urlParams.get('invoice_slug');
  const receiptUrl = urlParams.get('receipt_url');
  const captureMethod = urlParams.get('capture_method');
  const statusParam = urlParams.get('status');

  if (orderNsu || txNsu || slug) {
    try {
      showToast('Sincronizando pagamento com a InfinitePay...', 'info');
      const confirmRes = await API.request('/pagamentos/confirmar-retorno-checkout', {
        method: 'POST',
        body: JSON.stringify({
          order_nsu: orderNsu,
          transaction_nsu: txNsu,
          slug: slug,
          receipt_url: receiptUrl,
          capture_method: captureMethod,
          status: statusParam
        })
      });
      if (confirmRes && confirmRes.success) {
        showToast(confirmRes.message || 'Pagamento confirmado com sucesso!', 'success');
      }
    } catch (err) {
      console.warn('Erro ao confirmar retorno do checkout:', err);
    } finally {
      // Limpar parâmetros da URL após o processamento
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  // Inicializar carregamento de dados
  await loadDashboard();
});

async function loadDashboard() {
  try {
    const data = await API.request('/usuario/dashboard');
    currentDashboardData = data;

    // Atualizar dados do usuário no localStorage (incluindo is_admin, cpf, etc)
    if (data.usuario) {
      API.setUser(data.usuario);
    }

    // 1. Nome de boas-vindas
    if (welcomeUser && data.usuario) {
      const primeiroNome = (data.usuario.nome || 'Participante').trim().split(' ')[0];
      welcomeUser.textContent = `Olá, ${primeiroNome}!`;
    }

    // 2. Dados Pessoais com botão Editar
    if (userInfoCard && data.usuario) {
      userInfoCard.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h3 class="card-title" style="font-size: 1.1rem; margin-bottom: 0;">Meus Dados Pessoais</h3>
          <button class="btn btn-outline btn-sm" onclick="openEditModal()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
            <span>Editar</span>
          </button>
        </div>
        <p style="margin-bottom: 0.35rem;"><strong>Nome:</strong> ${data.usuario.nome || 'Não informado'}</p>
        <p style="margin-bottom: 0.35rem;"><strong>E-mail:</strong> ${data.usuario.email || 'Não informado'}</p>
        <p style="margin-bottom: 0.35rem;"><strong>CPF:</strong> ${data.usuario.cpf || 'Não informado'}</p>
        <p style="margin-bottom: 0.35rem;"><strong>Telefone:</strong> ${data.usuario.telefone || 'Não informado'}</p>
      `;
    }

    // Unificar lista de inscrições confirmadas e triagens pendentes
    const inscricoes = data.inscricoes || [];
    const triagens = data.triagens || [];

    const items = [
      ...inscricoes.map(ins => ({
        key: ins.tipo_registro === 'DIARIA' ? `dia_${ins.id}` : `ins_${ins.id}`,
        type: ins.tipo_registro === 'DIARIA' ? 'diaria' : 'inscricao',
        data: ins
      })),
      ...triagens.map(tr => ({
        key: tr.tipo_registro === 'DIARIA' ? `trdia_${tr.id}` : `tr_${tr.id}`,
        type: tr.tipo_registro === 'DIARIA' ? 'triagem_diaria' : 'triagem',
        data: tr
      }))
    ];

    const selectorContainer = document.getElementById('dashboard-selector-container');
    const eventSelect = document.getElementById('dashboard-event-select');

    if (items.length > 0) {
      if (items.length > 1) {
        if (selectorContainer) selectorContainer.style.display = 'flex';
        if (eventSelect) {
          eventSelect.innerHTML = items.map(item => {
            if (item.type === 'diaria') {
              const dia = item.data;
              return `<option value="${item.key}">[Diária] ${dia.evento_titulo || 'Evento'} (Diária - ${dia.status})</option>`;
            } else if (item.type === 'triagem_diaria') {
              const tr = item.data;
              return `<option value="${item.key}">[Pendente] ${tr.evento_titulo || 'Evento'} (Diária - Aguardando Pagamento)</option>`;
            } else if (item.type === 'inscricao') {
              const ins = item.data;
              return `<option value="${item.key}">${ins.evento_titulo || 'Evento'} (Inscrito - ${ins.status})</option>`;
            } else {
              const tr = item.data;
              return `<option value="${item.key}">${tr.evento_titulo || 'Evento'} (Aguardando Pagamento)</option>`;
            }
          }).join('');
        }
      } else {
        if (selectorContainer) selectorContainer.style.display = 'none';
      }

      // Definir a chave ativa padrão (preservar a seleção ou pegar o 1º item)
      const exists = items.some(it => it.key === activeEventKey);
      if (!activeEventKey || !exists) {
        activeEventKey = items[0].key;
      }

      if (eventSelect) {
        eventSelect.value = activeEventKey;
      }

      // Renderizar o item ativo
      renderActiveItem(activeEventKey);
    } else {
      if (selectorContainer) selectorContainer.style.display = 'none';
      if (registrationCard) {
        registrationCard.innerHTML = `
          <h3 class="card-title" style="font-size: 1.15rem; margin-bottom: 0.5rem;">Inscrições</h3>
          <p style="color: var(--text-muted); font-size: 0.9rem;">Você ainda não possui inscrições realizadas em eventos.</p>
          <a href="/" class="btn btn-primary" style="margin-top: 1.25rem;">
            <span>Ver Eventos Disponíveis</span>
          </a>
        `;
      }
      if (paymentsContainer) {
        paymentsContainer.innerHTML = `<p style="color: var(--text-muted);">Nenhum pagamento registrado.</p>`;
      }
    }

    // Renderizar histórico completo de inscrições e triagens para a Aba de Inscrições
    renderAllInscricoes(inscricoes, triagens, data.pagamentos || []);

  } catch (err) {
    showToast('Erro ao carregar dados do painel.', 'error');
  }
}

// Função para mudar o evento ativo no dashboard
window.changeDashboardEvent = function (eventKey) {
  activeEventKey = eventKey;
  renderActiveItem(activeEventKey);
};

window.selecionarEventosDashboard = function (eventKey) {
  switchTab('tab-painel');
  changeDashboardEvent(eventKey);
};

function renderActiveItem(eventKey) {
  if (!currentDashboardData || !eventKey) return;

  if (eventKey.startsWith('dia_')) {
    const diaId = parseInt(eventKey.replace('dia_', ''));
    renderActiveDiaria(diaId);
  } else if (eventKey.startsWith('trdia_')) {
    const trdiaId = parseInt(eventKey.replace('trdia_', ''));
    renderActiveTriagemDiaria(trdiaId);
  } else if (eventKey.startsWith('ins_')) {
    const insId = parseInt(eventKey.replace('ins_', ''));
    renderActiveRegistration(insId);
  } else if (eventKey.startsWith('tr_')) {
    const trId = parseInt(eventKey.replace('tr_', ''));
    renderActiveTriagem(trId);
  }
}

// Renderizar dados de uma Diária Confirmada
function renderActiveDiaria(diariaId) {
  const data = currentDashboardData;
  const dia = data.inscricoes ? data.inscricoes.find(item => item.id === diariaId && item.tipo_registro === 'DIARIA') : null;
  if (!dia) return;

  if (registrationCard) {
    let statusBadge = 'badge-warning';
    if (dia.status === 'CONFIRMADA') statusBadge = 'badge-success';
    else if (dia.status === 'CANCELADA' || dia.status === 'CANCELADO') statusBadge = 'badge-info';
    else if (dia.status === 'VENCIDA' || dia.status === 'VENCIDO') statusBadge = 'badge-danger';

    const valorFmt = parseFloat(dia.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const qrButtonHTML = dia.status === 'CONFIRMADA' && dia.codigo_checkin ?
      `<button type="button" class="btn btn-outline btn-sm event-checkin-btn" style="border-color: #7E22CE; color: #7E22CE;" onclick="openQrModal(this.dataset.code, this.dataset.title)" data-code="${dia.codigo_checkin}" data-title="${escapeHtmlOficina(dia.evento_titulo || 'Evento')}">
         <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><rect width="6" height="6" x="7" y="7"/></svg>
         <span>Visualizar QR Code (Diária)</span>
       </button>` : '';

    registrationCard.innerHTML = `
      <div class="event-card-header">
        <div style="display: flex; gap: 0.35rem; align-items: center;">
          <span class="badge" style="background: #FAF5FF; color: #7E22CE; border: 1px solid #C084FC; font-weight: 700;">DIÁRIA</span>
          <span class="badge ${statusBadge}">${dia.status}</span>
        </div>
        <div class="event-card-price" style="color: #7E22CE;">
          ${valorFmt}
        </div>
      </div>
      <h3 class="event-card-title">${escapeHtmlOficina(dia.evento_titulo || 'Evento')}</h3>
      <div class="event-card-divider"></div>
      <div class="event-info-list">
        <div class="event-info-line">
          <div class="event-info-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7E22CE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
            <span>Dias:</span>
          </div>
          <div class="event-info-val" style="color: #7E22CE;">${dia.dias_formatados}</div>
        </div>
        <div class="event-info-line">
          <div class="event-info-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>Local:</span>
          </div>
          <div class="event-info-val">${escapeHtmlOficina(dia.evento_local || 'A definir')}</div>
        </div>
        <div class="event-info-line">
          <div class="event-info-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
            <span>Pagamento:</span>
          </div>
          <div class="event-info-val">${dia.forma_pagamento || 'InfinitePay (Pix ou Cartão)'}</div>
        </div>
      </div>
      ${qrButtonHTML}
    `;
  }

  if (paymentsContainer) {
    const valorFmt = parseFloat(dia.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    paymentsContainer.innerHTML = `
      <div class="card" style="margin-bottom: 0;">
        <div class="parcela-card-item parcela-paga">
          <div class="parcela-card-top">
            <div class="parcela-card-num">
              <span>Pagamento da Diária</span>
            </div>
            <span class="badge badge-success">PAGO</span>
          </div>
          <div class="parcela-card-body">
            <div class="parcela-meta-col">
              <span class="parcela-meta-label">Modalidade</span>
              <span class="parcela-meta-val">Diária Confirmada</span>
            </div>
            <div class="parcela-meta-col text-right">
              <span class="parcela-meta-label">Valor Total</span>
              <span class="parcela-valor-highlight" style="color: #7E22CE;">${valorFmt}</span>
            </div>
          </div>
          ${dia.receipt_url ? `
            <div class="parcela-card-actions">
              <a href="${dia.receipt_url}" target="_blank" class="btn btn-outline btn-sm" style="border-color: #10B981; color: #10B981; text-decoration: none; width: 100%;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span>Comprovante de Pagamento</span>
              </a>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }
}

// Renderizar dados de uma Triagem de Diária Pendente
function renderActiveTriagemDiaria(trdiaId) {
  const data = currentDashboardData;
  const tr = data.triagens ? data.triagens.find(item => item.id === trdiaId && item.tipo_registro === 'DIARIA') : null;
  if (!tr) return;

  const valorFmt = parseFloat(tr.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  if (registrationCard) {
    registrationCard.innerHTML = `
      <div class="event-card-header">
        <div style="display: flex; gap: 0.35rem; align-items: center;">
          <span class="badge" style="background: #FAF5FF; color: #7E22CE; border: 1px solid #C084FC; font-weight: 700;">DIÁRIA</span>
          <span class="badge badge-warning">AGUARDANDO PAGAMENTO</span>
        </div>
        <div class="event-card-price" style="color: #7E22CE;">
          ${valorFmt}
        </div>
      </div>
      <h3 class="event-card-title">${escapeHtmlOficina(tr.evento_titulo || 'Evento')}</h3>
      <div class="event-card-divider"></div>
      <div class="event-info-list">
        <div class="event-info-line">
          <div class="event-info-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7E22CE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
            <span>Dias:</span>
          </div>
          <div class="event-info-val" style="color: #7E22CE;">${tr.dias_formatados}</div>
        </div>
        <div class="event-info-line">
          <div class="event-info-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>Local:</span>
          </div>
          <div class="event-info-val">${escapeHtmlOficina(tr.evento_local || 'A definir')}</div>
        </div>
        <div class="event-info-line">
          <div class="event-info-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
            <span>Pagamento:</span>
          </div>
          <div class="event-info-val">InfinitePay (Pix ou Cartão)</div>
        </div>
      </div>
      <div style="margin-top: 0.55rem; padding: 0.5rem 0.75rem; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: var(--radius-sm); font-size: 0.78rem; color: #92400E; line-height: 1.35;">
        <strong>Diária Iniciada:</strong> Conclua o pagamento pelo checkout da InfinitePay.
      </div>
    `;
  }

  if (paymentsContainer) {
    paymentsContainer.innerHTML = `
      <div class="card" style="margin-bottom: 0;">
        <div class="parcela-card-item parcela-pendente">
          <div class="parcela-card-top">
            <div class="parcela-card-num">
              <span>Pagamento da Diária</span>
            </div>
            <span class="badge badge-warning">AGUARDANDO PAGAMENTO</span>
          </div>
          <div class="parcela-card-body">
            <div class="parcela-meta-col">
              <span class="parcela-meta-label">Modalidade</span>
              <span class="parcela-meta-val">InfinitePay (Pix ou Cartão)</span>
            </div>
            <div class="parcela-meta-col text-right">
              <span class="parcela-meta-label">Valor</span>
              <span class="parcela-valor-highlight" style="color: #7E22CE;">${valorFmt}</span>
            </div>
          </div>
          <div class="parcela-card-actions">
            ${tr.checkout_url ? `
              <a href="${tr.checkout_url}" target="_blank" class="btn btn-primary btn-sm" style="background: #7E22CE; border-color: #7E22CE; text-decoration: none; width: 100%;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                <span>Efetuar Pagamento da Diária</span>
              </a>
            ` : '<p style="color: var(--text-muted); font-size: 0.8rem; margin: 0;">Link de checkout indisponível.</p>'}
          </div>
        </div>
      </div>
    `;
  }
}

// Renderizar dados de uma Inscrição Confirmada / Ativa
function renderActiveRegistration(inscricaoId) {
  const data = currentDashboardData;
  const ins = data.inscricoes ? data.inscricoes.find(item => item.id === inscricaoId) : null;
  if (!ins) return;

  if (registrationCard) {
    let statusBadge = 'badge-warning';
    if (ins.status === 'CONFIRMADA') statusBadge = 'badge-success';
    else if (ins.status === 'CANCELADA' || ins.status === 'CANCELADO') statusBadge = 'badge-info';
    else if (ins.status === 'VENCIDA' || ins.status === 'VENCIDO') statusBadge = 'badge-danger';
    const valorFmt = parseFloat(ins.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const qrButtonHTML = ins.status === 'CONFIRMADA' && ins.codigo_checkin ?
      `<button type="button" class="btn btn-outline btn-sm event-checkin-btn" onclick="openQrModal(this.dataset.code, this.dataset.title)" data-code="${ins.codigo_checkin}" data-title="${escapeHtmlOficina(ins.evento_titulo || 'Evento')}">
         <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><rect width="6" height="6" x="7" y="7"/></svg>
         <span>Visualizar QR Code de Check-in</span>
       </button>` : '';

    registrationCard.innerHTML = `
      <div class="event-card-header">
        <div>
          <span class="badge ${statusBadge}">${ins.status}</span>
        </div>
        <div class="event-card-price">
          ${valorFmt}
        </div>
      </div>
      <h3 class="event-card-title">${escapeHtmlOficina(ins.evento_titulo || 'Evento')}</h3>
      <div class="event-card-divider"></div>
      <div class="event-info-list">
        <div class="event-info-line">
          <div class="event-info-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>Local:</span>
          </div>
          <div class="event-info-val">${escapeHtmlOficina(ins.evento_local || 'A definir')}</div>
        </div>
        <div class="event-info-line">
          <div class="event-info-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
            <span>Pagamento:</span>
          </div>
          <div class="event-info-val">${formatarFormaPagamento(ins.forma_pagamento, ins.capture_method)}</div>
        </div>
      </div>
      ${qrButtonHTML}
    `;
  }

  // Renderizar pagamentos associados à inscrição selecionada
  const pagamentosFiltrados = (data.pagamentos || []).filter(pag => pag.inscricao_id === ins.id);
  renderRecentPayments(pagamentosFiltrados);
}

// Renderizar dados de uma Triagem Pendente
async function renderActiveTriagem(triagemId) {
  const data = currentDashboardData;
  const tr = data.triagens ? data.triagens.find(item => item.id === triagemId) : null;
  if (!tr) return;

  const valorFmt = parseFloat(tr.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  if (registrationCard) {
    registrationCard.innerHTML = `
      <div class="event-card-header">
        <div>
          <span class="badge badge-warning">AGUARDANDO PAGAMENTO</span>
        </div>
        <div class="event-card-price">
          ${valorFmt}
        </div>
      </div>
      <h3 class="event-card-title">${escapeHtmlOficina(tr.evento_titulo || 'Evento')}</h3>
      <div class="event-card-divider"></div>
      <div class="event-info-list">
        <div class="event-info-line">
          <div class="event-info-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>Local:</span>
          </div>
          <div class="event-info-val">${escapeHtmlOficina(tr.evento_local || 'A definir')}</div>
        </div>
        <div class="event-info-line">
          <div class="event-info-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
            <span>Pagamento:</span>
          </div>
          <div class="event-info-val">${formatarFormaPagamento(tr.forma_pagamento)}</div>
        </div>
      </div>
      <div style="margin-top: 0.55rem; padding: 0.5rem 0.75rem; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: var(--radius-sm); font-size: 0.78rem; color: #92400E; line-height: 1.35;">
        <strong>Inscrição Iniciada:</strong> Conclua o pagamento para garantir a sua vaga.
      </div>
    `;
  }

  if (paymentsContainer) {
    paymentsContainer.innerHTML = `
      <div style="padding: 1.5rem; text-align: center; color: var(--text-muted);">
        <span class="spinner-sm" style="border-top-color: var(--primary); margin-right: 0.5rem;"></span>
        Carregando boletos e opções de pagamento...
      </div>
    `;
  }

  try {
    const pagamentoRes = await API.request('/pagamentos/processar-triagem', {
      method: 'POST',
      body: JSON.stringify({ triagem_id: tr.id })
    });
    renderTriagemPayments(pagamentoRes, tr);
  } catch (err) {
    if (paymentsContainer) {
      paymentsContainer.innerHTML = `<p style="color: #EF4444; padding: 1rem;">Erro ao carregar boletos de pagamento. Tente novamente mais tarde.</p>`;
    }
  }
}

function renderTriagemPayments(pagamentoRes, tr) {
  if (!paymentsContainer) return;

  const formaPag = (pagamentoRes.forma_pagamento || tr.forma_pagamento || 'PIX').toUpperCase();

  if (formaPag === 'PARCELADO' && pagamentoRes.parcelas && pagamentoRes.parcelas.length > 0) {
    // 1. Linhas de Tabela para Desktop
    const parcelasRows = pagamentoRes.parcelas.map(parc => {
      const valorParcFmt = parseFloat(parc.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const pdfUrl = `${API_BASE_URL}/pagamentos/triagem/${tr.id}/parcela/${parc.numero}/pdf?token=${API.getToken()}`;

      const actionBtnHTML = parc.copia_cola_pix ?
        (parc.copia_cola_pix.startsWith('http') ?
          `<a href="${parc.copia_cola_pix}" target="_blank" class="btn btn-primary btn-sm" style="text-decoration: none;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
            <span>Pagar Parcela</span>
          </a>` :
          `<button class="btn btn-outline btn-sm" onclick="copiarPixString('${parc.copia_cola_pix}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            <span>Copiar Pix</span>
          </button>`
        ) : '';

      return `
        <tr>
          <td><strong>Parcela ${parc.numero}</strong></td>
          <td>${parc.vencimento ? new Date(parc.vencimento + (parc.vencimento.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('pt-BR') : 'N/A'}</td>
          <td><strong>${valorParcFmt}</strong></td>
          <td><span class="badge badge-warning">PENDENTE</span></td>
          <td>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              ${actionBtnHTML}
              <a href="${pdfUrl}" target="_blank" class="btn btn-outline btn-sm" style="text-decoration: none;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span>Carnê PDF</span>
              </a>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // 2. Cards para Mobile
    const mobileCards = pagamentoRes.parcelas.map(parc => {
      const valorParcFmt = parseFloat(parc.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const pdfUrl = `${API_BASE_URL}/pagamentos/triagem/${tr.id}/parcela/${parc.numero}/pdf?token=${API.getToken()}`;
      const dtVenc = parc.vencimento ? new Date(parc.vencimento + (parc.vencimento.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('pt-BR') : 'N/A';

      const actionBtnMobile = parc.copia_cola_pix ?
        (parc.copia_cola_pix.startsWith('http') ?
          `<a href="${parc.copia_cola_pix}" target="_blank" class="btn btn-primary btn-sm" style="text-decoration: none;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
            <span>Pagar</span>
          </a>` :
          `<button class="btn btn-outline btn-sm" onclick="copiarPixString('${parc.copia_cola_pix}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            <span>Copiar Pix</span>
          </button>`
        ) : '';

      return `
        <div class="parcela-card-item parcela-pendente">
          <div class="parcela-card-top">
            <div class="parcela-card-num">
              <span>Parcela ${parc.numero}</span>
            </div>
            <span class="badge badge-warning">PENDENTE</span>
          </div>
          <div class="parcela-card-body">
            <div class="parcela-meta-col">
              <span class="parcela-meta-label">Vencimento</span>
              <span class="parcela-meta-val">${dtVenc}</span>
            </div>
            <div class="parcela-meta-col text-right">
              <span class="parcela-meta-label">Valor</span>
              <span class="parcela-valor-highlight">${valorParcFmt}</span>
            </div>
          </div>
          <div class="parcela-card-actions">
            ${actionBtnMobile}
            <a href="${pdfUrl}" target="_blank" class="btn btn-outline btn-sm" style="text-decoration: none;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span>Carnê PDF</span>
            </a>
          </div>
        </div>
      `;
    }).join('');

    paymentsContainer.innerHTML = `
      <div class="card">
        <h3 class="card-title" style="font-size: 1.1rem; margin-bottom: 0.4rem;">Parcelamento (${tr.evento_titulo || 'Evento'})</h3>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.25rem;">
          Clique em <strong>Pagar Parcela</strong> para acionar o pagamento online ou em <strong>Carnê PDF</strong> para visualizar e imprimir o boleto.
        </p>

        <!-- Tabela no Desktop -->
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Nº</th>
                <th>Vencimento</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>${parcelasRows}</tbody>
          </table>
        </div>

        <!-- Cards no Mobile -->
        <div class="parcelas-mobile-list">
          ${mobileCards}
        </div>
      </div>
    `;
  } else {
    const valorPagFmt = parseFloat(tr.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const receiptUrl = pagamentoRes.receipt_url || pagamentoRes.copia_cola_pix;

    let pixBtnHTML = '';
    if (pagamentoRes.copia_cola_pix && !pagamentoRes.copia_cola_pix.startsWith('http')) {
      pixBtnHTML = `
        <button class="btn btn-outline btn-sm" onclick="copiarPixString('${pagamentoRes.copia_cola_pix}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          <span>Copiar Código Pix</span>
        </button>
      `;
    }

    paymentsContainer.innerHTML = `
      <div class="card">
        <h3 class="card-title" style="font-size: 1.1rem;">Pagamento - ${formatarFormaPagamento(formaPag)}</h3>
        <p style="margin-top: 0.4rem; font-size: 0.95rem;">Valor Total: <strong style="color: var(--primary);">${valorPagFmt}</strong> | Status: <span class="badge badge-warning">AGUARDANDO PAGAMENTO</span></p>
        <div style="margin-top: 1.25rem; display: flex; gap: 0.75rem; flex-wrap: wrap;">
          ${receiptUrl && receiptUrl.startsWith('http') ?
        `<a href="${receiptUrl}" target="_blank" class="btn btn-primary" style="text-decoration: none;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
              <span>Efetuar Pagamento da Inscrição</span>
            </a>` : ''
      }
          ${pixBtnHTML}
        </div>
      </div>
    `;
  }
}

function renderRecentPayments(pagamentos) {
  if (!paymentsContainer) return;
  if (!pagamentos || pagamentos.length === 0) {
    paymentsContainer.innerHTML = `<p style="color: var(--text-muted);">Nenhum pagamento registrado.</p>`;
    return;
  }

  const getStatusBadge = (st) => {
    if (st === 'PAGO') return 'badge-success';
    if (st === 'CANCELADO' || st === 'CANCELADA') return 'badge-info';
    if (st === 'VENCIDO' || st === 'VENCIDA') return 'badge-danger';
    return 'badge-warning';
  };

  paymentsContainer.innerHTML = pagamentos.map(pag => {
    if (pag.parcelas && pag.parcelas.length > 0) {
      // Desktop Rows
      const parcelasRows = pag.parcelas.map(parc => {
        const valorParcFmt = parseFloat(parc.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const pdfUrl = `${API_BASE_URL}/pagamentos/parcelas/${parc.id}/pdf?token=${API.getToken()}`;
        const isCancelled = parc.status === 'CANCELADO' || parc.status === 'CANCELADA' || pag.status === 'CANCELADO';

        return `
          <tr>
            <td><strong>Parcela ${parc.numero}</strong></td>
            <td>${parc.vencimento ? new Date(parc.vencimento + (parc.vencimento.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('pt-BR') : 'N/A'}</td>
            <td><strong>${valorParcFmt}</strong></td>
            <td><span class="badge ${getStatusBadge(parc.status)}">${parc.status}</span></td>
            <td>
              <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                ${!isCancelled && parc.status !== 'PAGO' && parc.copia_cola_pix ?
            (parc.copia_cola_pix.startsWith('http') ?
              `<a href="${parc.copia_cola_pix}" target="_blank" class="btn btn-primary btn-sm" style="text-decoration: none;">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                      <span>Pagar Parcela</span>
                    </a>` :
              `<button class="btn btn-outline btn-sm" onclick="copiarPixString('${parc.copia_cola_pix}')">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                      <span>Copiar Pix</span>
                    </button>`
            ) : ''
          }
                ${!isCancelled && parc.status !== 'PAGO' ?
            `<button class="btn btn-outline btn-sm" onclick="verificarStatusParcela(${parc.id}, 'ORD-${pag.inscricao_id}-PARC-${parc.numero}')" style="font-size: 0.775rem;" title="Clique aqui caso já tenha efetuado o pagamento para atualizar o status">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
                    <span>Já paguei</span>
                  </button>` : ''
          }
                ${!isCancelled ?
            `<a href="${pdfUrl}" target="_blank" class="btn btn-outline btn-sm" style="text-decoration: none;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <span>Carnê PDF</span>
                  </a>` : ''
          }
              </div>
            </td>
          </tr>
        `;
      }).join('');

      // Mobile Cards
      const mobileCards = pag.parcelas.map(parc => {
        const valorParcFmt = parseFloat(parc.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const pdfUrl = `${API_BASE_URL}/pagamentos/parcelas/${parc.id}/pdf?token=${API.getToken()}`;
        const isCancelled = parc.status === 'CANCELADO' || parc.status === 'CANCELADA' || pag.status === 'CANCELADO';
        const isPaid = parc.status === 'PAGO';
        const isPending = !isPaid && !isCancelled;
        const statusClass = isPaid ? 'parcela-paga' : (isPending ? 'parcela-pendente' : 'parcela-vencida');
        const dtVenc = parc.vencimento ? new Date(parc.vencimento + (parc.vencimento.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('pt-BR') : 'N/A';

        let actionBtns = '';
        if (!isCancelled && !isPaid && parc.copia_cola_pix) {
          if (parc.copia_cola_pix.startsWith('http')) {
            actionBtns += `<a href="${parc.copia_cola_pix}" target="_blank" class="btn btn-primary btn-sm" style="text-decoration: none;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
              <span>Pagar</span>
            </a>`;
          } else {
            actionBtns += `<button class="btn btn-outline btn-sm" onclick="copiarPixString('${parc.copia_cola_pix}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              <span>Pix</span>
            </button>`;
          }
        }
        if (!isCancelled && !isPaid) {
          actionBtns += `<button class="btn btn-outline btn-sm" onclick="verificarStatusParcela(${parc.id}, 'ORD-${pag.inscricao_id}-PARC-${parc.numero}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
            <span>Já paguei</span>
          </button>`;
        }
        if (!isCancelled) {
          actionBtns += `<a href="${pdfUrl}" target="_blank" class="btn btn-outline btn-sm" style="text-decoration: none;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span>Carnê PDF</span>
          </a>`;
        }

        return `
          <div class="parcela-card-item ${statusClass}">
            <div class="parcela-card-top">
              <div class="parcela-card-num">
                <span>Parcela ${parc.numero}</span>
              </div>
              <span class="badge ${getStatusBadge(parc.status)}">${parc.status}</span>
            </div>
            <div class="parcela-card-body">
              <div class="parcela-meta-col">
                <span class="parcela-meta-label">Vencimento</span>
                <span class="parcela-meta-val">${dtVenc}</span>
              </div>
              <div class="parcela-meta-col text-right">
                <span class="parcela-meta-label">Valor</span>
                <span class="parcela-valor-highlight">${valorParcFmt}</span>
              </div>
            </div>
            ${actionBtns ? `
              <div class="parcela-card-actions">
                ${actionBtns}
              </div>
            ` : ''}
          </div>
        `;
      }).join('');

      return `
        <div class="card">
          <h3 class="card-title" style="font-size: 1.1rem; margin-bottom: 1rem;">Parcelamento (${pag.evento_titulo || 'Evento'})</h3>
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>${parcelasRows}</tbody>
            </table>
          </div>
          <div class="parcelas-mobile-list">
            ${mobileCards}
          </div>
        </div>
      `;
    } else {
      const valorPagFmt = parseFloat(pag.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const isCancelled = pag.status === 'CANCELADO' || pag.status === 'CANCELADA';
      return `
        <div class="card">
          <h3 class="card-title" style="font-size: 1.1rem;">Pagamento - ${formatarFormaPagamento(pag.forma_pagamento, pag.capture_method)}</h3>
          <p style="margin-top: 0.4rem; font-size: 0.95rem;">Valor: <strong style="color: var(--primary);">${valorPagFmt}</strong> | Status: <span class="badge ${getStatusBadge(pag.status)}">${pag.status}</span></p>
          ${pag.receipt_url && !isCancelled ?
          (pag.status === 'PAGO' ?
            `<a href="${pag.receipt_url}" target="_blank" class="btn btn-outline btn-sm" style="margin-top: 1rem; border-color: #10B981; color: #10B981; text-decoration: none; font-weight: 600;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span>Comprovante de Pagamento</span>
              </a>` :
            `<a href="${pag.receipt_url}" target="_blank" class="btn btn-primary" style="margin-top: 1rem; text-decoration: none;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                <span>Pagar Inscrição</span>
              </a>`
          ) : ''
        }
        </div>
      `;
    }
  }).join('');
}

function renderAllInscricoes(inscricoes, triagens, pagamentos) {
  const container = document.getElementById('all-registrations-container');
  if (!container) return;

  const hasInscricoes = inscricoes && inscricoes.length > 0;
  const hasTriagens = triagens && triagens.length > 0;

  if (!hasInscricoes && !hasTriagens) {
    container.innerHTML = `<p style="color: var(--text-muted);">Nenhum histórico de inscrições encontrado.</p>`;
    return;
  }

  const getStatusBadge = (st) => {
    if (st === 'PAGO' || st === 'CONFIRMADA') return 'badge-success';
    if (st === 'CANCELADO' || st === 'CANCELADA') return 'badge-info';
    if (st === 'VENCIDO' || st === 'VENCIDA') return 'badge-danger';
    return 'badge-warning';
  };

  let htmlTriagens = '';
  if (hasTriagens) {
    htmlTriagens = triagens.map(tr => {
      const valorTotalFmt = parseFloat(tr.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const dataReg = new Date(tr.created_at).toLocaleDateString('pt-BR');

      if (tr.tipo_registro === 'DIARIA') {
        return `
          <div class="card" style="margin-bottom: 1.5rem; border: 1.5px solid #C084FC; background: #FAF5FF; box-shadow: none;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem;">
              <div>
                <span class="badge" style="background: #7E22CE; color: white; font-weight: 700; margin-right: 0.35rem;">DIÁRIA</span>
                <span class="badge badge-warning">AGUARDANDO PAGAMENTO</span>
                <h3 class="card-title" style="margin-top: 0.5rem; font-size: 1.15rem;">${tr.evento_titulo || 'Evento'}</h3>
                <p style="font-size: 0.85rem; color: #581C87; margin-top: 0.25rem; line-height: 1.5;">
                  <strong>Dias Contratados:</strong> ${tr.dias_formatados || 'N/A'}<br>
                  Início da solicitação: ${dataReg}<br>
                  Local: ${tr.evento_local || 'A definir'}<br>
                  Pagamento: <strong>InfinitePay (Pix ou Cartão)</strong>
                </p>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 1.15rem; font-weight: 800; color: #7E22CE; font-family: 'Plus Jakarta Sans', sans-serif;">${valorTotalFmt}</div>
                <div style="font-size: 0.8rem; color: #9333EA; font-weight: 600; margin-top: 0.25rem;">Pagamento Pendente</div>
              </div>
            </div>
            <div style="margin-top: 1rem; padding: 0.75rem 1rem; background: #F3E8FF; border-radius: var(--radius-md); font-size: 0.85rem; color: #6B21A8; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
              <span><strong>Atenção:</strong> sua vaga NÃO está reservada até que conclua o pagamento.</span>
              <button class="btn btn-primary btn-sm" style="background: #7E22CE; border-color: #7E22CE;" onclick="selecionarEventosDashboard('trdia_${tr.id}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                <span>Pagar Diária</span>
              </button>
            </div>
          </div>
        `;
      }

      return `
        <div class="card" style="margin-bottom: 1.5rem; border: 1.5px solid #F59E0B; background: #FFFDF5; box-shadow: none;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem;">
            <div>
              <span class="badge badge-warning">AGUARDANDO PAGAMENTO</span>
              <h3 class="card-title" style="margin-top: 0.5rem; font-size: 1.15rem;">${tr.evento_titulo || 'Evento'}</h3>
              <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem;">
                Início da solicitação: ${dataReg}<br>
                Local: ${tr.evento_local || 'A definir'}<br>
                Forma de Pagamento: <strong>${formatarFormaPagamento(tr.forma_pagamento)}</strong>
              </p>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 1.15rem; font-weight: 800; color: var(--primary); font-family: 'Plus Jakarta Sans', sans-serif;">${valorTotalFmt}</div>
              <div style="font-size: 0.8rem; color: #D97706; font-weight: 600; margin-top: 0.25rem;">Pagamento Pendente</div>
            </div>
          </div>
          <div style="margin-top: 1rem; padding: 0.75rem 1rem; background: #FEF3C7; border-radius: var(--radius-md); font-size: 0.85rem; color: #92400E; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
            <span><strong>Atenção:</strong> sua vaga NÃO está reservada até que você conclua o pagamento.</span>
            <button class="btn btn-primary btn-sm" onclick="selecionarEventosDashboard('tr_${tr.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span>Ver Boletos / Pagar</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  let htmlInscricoes = '';
  if (hasInscricoes) {
    htmlInscricoes = inscricoes.map(ins => {
      const dataReg = new Date(ins.created_at).toLocaleDateString('pt-BR');
      let badgeClass = 'badge-warning';
      if (ins.status === 'CONFIRMADA') badgeClass = 'badge-success';
      else if (ins.status === 'CANCELADA' || ins.status === 'CANCELADO') badgeClass = 'badge-info';
      else if (ins.status === 'VENCIDA' || ins.status === 'VENCIDO') badgeClass = 'badge-danger';

      if (ins.tipo_registro === 'DIARIA') {
        const totalInscFmt = parseFloat(ins.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const qrButtonHTML = ins.status === 'CONFIRMADA' && ins.codigo_checkin ?
          `<button class="btn btn-outline btn-sm" style="border-color: #7E22CE; color: #7E22CE; font-weight: 600;" onclick="openQrModal('${ins.codigo_checkin}', '${(ins.evento_titulo || '').replace(/'/g, "\\'")}')">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3"/></svg>
             <span>Ver QR Code</span>
           </button>` : '';

        return `
          <div class="card" style="margin-bottom: 1.5rem; border: 1.5px solid #DDD6FE; background: #FFFFFF;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem;">
              <div>
                <span class="badge" style="background: #FAF5FF; color: #7E22CE; border: 1px solid #C084FC; font-weight: 700; margin-right: 0.35rem;">DIÁRIA</span>
                <span class="badge ${badgeClass}">${ins.status}</span>
                <h3 class="card-title" style="margin-top: 0.5rem; font-size: 1.15rem;">${ins.evento_titulo}</h3>
                <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem; line-height: 1.5;">
                  <strong>Dias Contratados:</strong> <span style="color: #6B21A8; font-weight: 600;">${ins.dias_formatados || 'N/A'}</span><br>
                  Data da Compra: ${dataReg}<br>
                  Local do Evento: ${ins.evento_local || 'A definir'}
                </p>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 1.15rem; font-weight: 800; color: #7E22CE; font-family: 'Plus Jakarta Sans', sans-serif;">${totalInscFmt}</div>
                <div style="font-size: 0.8rem; color: #047857; font-weight: 600; margin-top: 0.25rem;">Total Pago: ${totalInscFmt}</div>
                <div style="margin-top: 0.75rem;">
                  ${qrButtonHTML}
                </div>
              </div>
            </div>
          </div>
        `;
      }

      const insPags = (pagamentos || []).filter(pag => pag.inscricao_id === ins.id);

      let totalPago = 0;
      insPags.forEach(pag => {
        if (pag.forma_pagamento === 'PARCELADO') {
          pag.parcelas.forEach(parc => {
            if (parc.status === 'PAGO') totalPago += parc.valor;
          });
        } else if (pag.status === 'PAGO') {
          totalPago += pag.valor;
        }
      });

      const totalPagoFmt = totalPago.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const totalInscFmt = parseFloat(ins.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      return `
        <div class="card" style="margin-bottom: 1.5rem; border: 1.5px solid var(--border-color); background: #FFFFFF;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem;">
            <div>
              <span class="badge ${badgeClass}">${ins.status}</span>
              <h3 class="card-title" style="margin-top: 0.5rem; font-size: 1.15rem;">${ins.evento_titulo}</h3>
              <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem;">
                Data da Inscrição: ${dataReg}<br>
                Local do Evento: ${ins.evento_local || 'A definir'}
              </p>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 1.15rem; font-weight: 800; color: var(--primary); font-family: 'Plus Jakarta Sans', sans-serif;">${totalInscFmt}</div>
              <div style="font-size: 0.8rem; color: #047857; font-weight: 600; margin-top: 0.25rem;">Total Pago: ${totalPagoFmt}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  container.innerHTML = htmlTriagens + htmlInscricoes;
}


window.openEditModal = function () {
  if (!currentDashboardData || !currentDashboardData.usuario) return;
  const user = currentDashboardData.usuario;
  document.getElementById('edit-nome').value = user.nome || '';
  document.getElementById('edit-email').value = user.email || '';
  document.getElementById('edit-telefone').value = user.telefone || '';
  document.getElementById('edit-senha').value = '';
  const modal = document.getElementById('edit-profile-modal');
  if (modal) modal.style.display = 'flex';
};

window.closeEditModal = function () {
  const modal = document.getElementById('edit-profile-modal');
  if (modal) modal.style.display = 'none';
};

window.salvarPerfil = async function (e) {
  e.preventDefault();
  const payload = {
    nome: document.getElementById('edit-nome').value.trim(),
    email: document.getElementById('edit-email').value.trim(),
    telefone: document.getElementById('edit-telefone').value.trim()
  };
  const senha = document.getElementById('edit-senha').value;
  if (senha) {
    payload.senha = senha;
  }

  try {
    await API.request('/usuario/perfil', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    showToast('Dados cadastrais atualizados com sucesso!', 'success');
    closeEditModal();
    await loadDashboard();
  } catch (err) {
    showToast(err.message || 'Erro ao atualizar dados do perfil.', 'error');
  }
};

function logout() {
  if (typeof window.fecharMenuMobile === "function") {
    window.fecharMenuMobile();
  }
  API.removeToken();
  window.location.href = 'login.html';
}

function copiarPixString(pixCode) {
  if (pixCode) {
    navigator.clipboard.writeText(pixCode);
    showToast('Código Pix copiado!', 'success');
  }
}

function formatarFormaPagamento(forma, captureMethod) {
  if (forma === 'INFINITEPAY') {
    if (captureMethod === 'pix') {
      return 'InfinitePay (Pix)';
    } else if (captureMethod === 'credit_card' || captureMethod === 'card') {
      return 'InfinitePay (Cartão)';
    }
    return 'InfinitePay';
  }
  if (forma === 'PIX') return 'Pix à Vista';
  if (forma === 'PARCELADO') return 'Parcelado (Carnê)';
  return forma || 'N/A';
}

window.atualizarSenhaParticipante = async function (e) {
  e.preventDefault();

  const senhaAtual = document.getElementById('pass-atual').value;
  const novaSenha = document.getElementById('pass-nova').value;
  const novaSenhaConfirm = document.getElementById('pass-nova-confirm').value;

  const errorDiv = document.getElementById('alterar-senha-error');
  const successDiv = document.getElementById('alterar-senha-success');
  const saveBtn = document.getElementById('btn-salvar-senha');

  errorDiv.style.display = 'none';
  successDiv.style.display = 'none';

  if (novaSenha.length < 6) {
    errorDiv.style.display = 'block';
    errorDiv.textContent = 'A nova senha deve conter pelo menos 6 caracteres.';
    return;
  }

  if (novaSenha !== novaSenhaConfirm) {
    errorDiv.style.display = 'block';
    errorDiv.textContent = 'As novas senhas informadas não coincidem.';
    return;
  }

  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="spinner-sm"></span> Atualizando...';

  try {
    await API.request('/usuario/alterar-senha', {
      method: 'POST',
      body: JSON.stringify({
        senha_atual: senhaAtual,
        nova_senha: novaSenha
      })
    });

    successDiv.style.display = 'block';
    successDiv.textContent = 'Senha atualizada com sucesso!';
    document.getElementById('form-alterar-senha').reset();
  } catch (err) {
    errorDiv.style.display = 'block';
    errorDiv.textContent = err.message || 'Erro ao alterar senha. Verifique se a senha atual está correta.';
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Atualizar Senha';
  }
};

window.openQrModal = function (codigo, eventoTitulo) {
  const modal = document.getElementById('qr-code-modal');
  const img = document.getElementById('qr-code-img');
  const codeText = document.getElementById('qr-code-text');
  const downloadBtn = document.getElementById('btn-download-qr');
  const title = document.getElementById('qr-modal-title');

  if (modal && img && codeText && downloadBtn) {
    if (title) title.textContent = `Check-in: ${eventoTitulo}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${codigo}`;
    img.src = qrUrl;
    codeText.textContent = codigo;
    downloadBtn.href = qrUrl;
    modal.style.display = 'flex';
  }
};

window.closeQrModal = function () {
  const modal = document.getElementById('qr-code-modal');
  if (modal) modal.style.display = 'none';
};

window.verificarStatusParcela = async function (parcelaId, orderNsu) {
  try {
    showToast('Sincronizando status da parcela com o servidor...', 'info');
    const res = await API.request('/pagamentos/confirmar-retorno-checkout', {
      method: 'POST',
      body: JSON.stringify({
        order_nsu: orderNsu || `PARCELA-${parcelaId}`
      })
    });
    if (res && res.success) {
      showToast(res.message || 'Parcela confirmada com sucesso!', 'success');
      await loadDashboard();
    } else {
      showToast(res.message || 'O pagamento ainda não foi identificado ou está em processamento na InfinitePay.', 'warning');
    }
  } catch (err) {
    showToast('Não foi possível sincronizar o status no momento. Tente novamente em instantes.', 'error');
  }
};



// ==========================================
// MÓDULO DE OFICINAS DO PARTICIPANTE
// ==========================================
let currentOficinasData = null;
let activeOficinaEventoId = null;


function escapeHtmlOficina(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.carregarOficinasParticipante = async function () {
  const container = document.getElementById('user-oficinas-container');
  const menuLink = document.getElementById('menu-oficinas');
  const menuLi = menuLink ? menuLink.closest('li') : null;

  try {
    const data = await API.request('/oficinas/participante');
    currentOficinasData = data;

    if (menuLi) {
      menuLi.style.display = data.aba_participante_visivel === false ? 'none' : '';
    }

    if (container) {
      renderizarOficinasParticipante();
    }
  } catch (err) {
    if (container) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 2rem; color: #DC2626;">
          <p style="font-weight: 600;">Não foi possível carregar as oficinas no momento.</p>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.35rem;">${escapeHtmlOficina(err.message || 'Tente novamente em instantes.')}</p>
        </div>
      `;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (API.getToken()) {
    carregarOficinasParticipante();
  }
});

window.selecionarEventoOficinaParticipante = function (eventoId) {
  activeOficinaEventoId = Number(eventoId);
  renderizarOficinasParticipante();
};

function renderizarOficinasParticipante() {
  const container = document.getElementById('user-oficinas-container');
  if (!container || !currentOficinasData) return;

  if (currentOficinasData.aba_participante_visivel === false) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 2.25rem 1.25rem; border-radius: 12px;">
        <h3 style="font-size: 1.05rem; font-weight: 700; color: #0B1F3B; margin-bottom: 0.35rem; font-family: 'Plus Jakarta Sans', sans-serif;">Inscrições de Oficinas Indisponíveis</h3>
        <p style="color: #64748B; font-size: 0.85rem; max-width: 480px; margin: 0 auto; line-height: 1.45;">
          As oficinas ainda não foram liberadas pela organização do evento.
        </p>
      </div>
    `;
    return;
  }

  const eventos = currentOficinasData.eventos || [];

  if (!currentOficinasData.possui_inscricao_evento || eventos.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 2.25rem 1.25rem; border-radius: 12px;">
        <div style="width: 48px; height: 48px; border-radius: 50%; background: #EAF2FF; color: #0756C9; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 0.75rem;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h3 style="font-size: 1.05rem; font-weight: 700; color: #0B1F3B; margin-bottom: 0.35rem; font-family: 'Plus Jakarta Sans', sans-serif;">Inscrição no Evento Necessária</h3>
        <p style="color: #64748B; font-size: 0.85rem; max-width: 480px; margin: 0 auto; line-height: 1.45;">
          Apenas participantes com inscrição ativa em um evento podem ocupar vagas nas oficinas vinculadas a ele.
        </p>
      </div>
    `;
    return;
  }

  const exists = eventos.some(ev => Number(ev.evento_id) === Number(activeOficinaEventoId));
  if (!activeOficinaEventoId || !exists) {
    activeOficinaEventoId = Number(eventos[0].evento_id);
  }

  const eventoAtivo = eventos.find(ev => Number(ev.evento_id) === Number(activeOficinaEventoId)) || eventos[0];
  const oficinas = eventoAtivo.oficinas || [];
  const minhaOficina = eventoAtivo.minha_oficina || null;

  let selectorHtml = '';
  if (eventos.length > 1) {
    selectorHtml = `
      <div class="selector-card" style="margin-bottom: 0.75rem;">
        <div style="display: flex; align-items: center; gap: 0.65rem; width: 100%;">
          <div style="background: #EAF2FF; color: #0756C9; padding: 0.5rem; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
          </div>
          <div style="flex: 1;">
            <label for="oficinas-event-select" style="display: block; font-size: 0.72rem; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em;">Evento Vinculado</label>
            <select id="oficinas-event-select" class="form-control" onchange="selecionarEventoOficinaParticipante(this.value)" style="margin-top: 0.15rem; font-weight: 700; color: #0756C9;">
              ${eventos.map(ev => `<option value="${ev.evento_id}" ${Number(ev.evento_id) === Number(eventoAtivo.evento_id) ? 'selected' : ''}>${escapeHtmlOficina(ev.evento_titulo)}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
    `;
  }

  let minhaOficinaHtml = '';
  if (minhaOficina) {
    minhaOficinaHtml = `
      <div class="minha-oficina-card">
        <span class="badge-vaga-garantida">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Sua vaga está garantida</span>
        </span>
        <h3 class="minha-oficina-title" onclick="abrirModalOficina(${minhaOficina.id})">
          ${escapeHtmlOficina(minhaOficina.nome)}
        </h3>
        <div class="minha-oficina-metas">
          ${minhaOficina.ministrante ? `
            <div class="minha-meta-tag">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span>${escapeHtmlOficina(minhaOficina.ministrante)}</span>
            </div>
          ` : ''}
          ${minhaOficina.horario ? `
            <div class="minha-meta-tag">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>${escapeHtmlOficina(minhaOficina.horario)}</span>
            </div>
          ` : ''}
          ${minhaOficina.local ? `
            <div class="minha-meta-tag">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span>${escapeHtmlOficina(minhaOficina.local)}</span>
            </div>
          ` : ''}
        </div>
        <div class="minha-oficina-actions">
          <button type="button" class="btn-minha-detalhes" onclick="abrirModalOficina(${minhaOficina.id})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span>Ver detalhes</span>
          </button>
          <button type="button" class="btn-minha-liberar" onclick="cancelarInscricaoOficinaParticipante(${minhaOficina.id}, '${escapeHtmlOficina(minhaOficina.nome)}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            <span>Liberar vaga</span>
          </button>
        </div>
      </div>
    `;
  }

  if (oficinas.length === 0) {
    container.innerHTML = `
      ${selectorHtml}
      <div class="card" style="text-align: center; padding: 2.25rem 1.25rem; border-radius: 12px;">
        <h3 style="font-size: 1.05rem; font-weight: 700; color: #0B1F3B; margin-bottom: 0.35rem; font-family: 'Plus Jakarta Sans', sans-serif;">Nenhuma oficina disponível no momento</h3>
        <p style="color: #64748B; font-size: 0.85rem; line-height: 1.45;">As oficinas do evento <strong>${escapeHtmlOficina(eventoAtivo.evento_titulo)}</strong> serão liberadas em breve pela organização.</p>
      </div>
    `;
    return;
  }

  const cardsHtml = oficinas.map(of => {
    const cap = Number(of.capacidade || 0);
    const ocup = Number(of.vagas_ocupadas || 0);
    const disp = Number(of.vagas_disponiveis || 0);
    const pct = cap > 0 ? Math.min(100, Math.round((ocup / cap) * 100)) : 0;
    const isInscrito = Boolean(of.inscrito_nesta);
    const isEsgotada = Boolean(of.esgotada);

    let barColor = '#0756C9';
    if (isEsgotada) barColor = '#EF4444';
    else if (pct >= 75) barColor = '#F59E0B';

    let cardStateClass = 'card-estado-disponivel';
    let statusBadgeHtml = '';

    if (isInscrito) {
      cardStateClass = 'card-estado-selecionada';
      statusBadgeHtml = `<span class="badge badge-success" style="display:inline-flex; align-items:center; gap:0.25rem; font-size:0.72rem;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Selecionada</span>`;
    } else if (isEsgotada) {
      cardStateClass = 'card-estado-esgotada';
      statusBadgeHtml = `<span class="badge badge-danger" style="font-size:0.72rem;">Esgotada</span>`;
    } else {
      statusBadgeHtml = `<span class="badge badge-vagas-disponivel">${disp} ${disp === 1 ? 'vaga disponível' : 'vagas disponíveis'}</span>`;
    }

    let actionBtnHtml = '';
    if (isInscrito) {
      actionBtnHtml = `
        <button type="button" class="btn btn-outline btn-app-action btn-danger-outline" onclick="cancelarInscricaoOficinaParticipante(${of.id}, '${escapeHtmlOficina(of.nome)}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          <span>Liberar vaga</span>
        </button>
      `;
    } else if (isEsgotada) {
      actionBtnHtml = `
        <button type="button" class="btn btn-app-action btn-esgotada-disabled" disabled>
          <span>Vagas esgotadas</span>
        </button>
      `;
    } else if (minhaOficina) {
      actionBtnHtml = `
        <button type="button" class="btn btn-outline btn-app-action" style="border-color: #0756C9; color: #0756C9;" onclick="inscreverEmOficinaParticipante(${of.id}, '${escapeHtmlOficina(of.nome)}', true)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
          <span>Trocar para esta oficina</span>
        </button>
      `;
    } else {
      actionBtnHtml = `
        <button type="button" class="btn btn-primary btn-app-action" onclick="inscreverEmOficinaParticipante(${of.id}, '${escapeHtmlOficina(of.nome)}', false)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
          <span>Selecionar oficina</span>
        </button>
      `;
    }

    return `
      <div class="oficina-app-card ${cardStateClass}">
        <div>
          <div class="oficina-app-header">
            <span class="oficina-event-tag">${escapeHtmlOficina(of.evento_titulo)}</span>
            ${statusBadgeHtml}
          </div>

          <div class="oficina-app-title-row" style="margin-top: 0.45rem;">
            <div class="oficina-app-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            </div>
            <h3 class="oficina-app-name" onclick="abrirModalOficina(${of.id})">
              ${escapeHtmlOficina(of.nome)}
            </h3>
          </div>

          ${of.ministrante ? `
            <div class="oficina-app-instructor" style="margin-top: 0.35rem;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span>Ministrante: <strong>${escapeHtmlOficina(of.ministrante)}</strong></span>
            </div>
          ` : ''}

          ${of.descricao ? `
            <div class="oficina-app-desc-box">
              <p class="oficina-app-desc">${escapeHtmlOficina(of.descricao)}</p>
              <button type="button" class="btn-ver-detalhes-link" onclick="abrirModalOficina(${of.id})">
                <span>Ver detalhes</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          ` : ''}

          <div class="oficina-app-pills" style="margin-top: 0.55rem;">
            ${of.horario ? `
              <span class="oficina-compact-pill">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>${escapeHtmlOficina(of.horario)}</span>
              </span>
            ` : ''}
            ${of.local ? `
              <span class="oficina-compact-pill">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span>${escapeHtmlOficina(of.local)}</span>
              </span>
            ` : ''}
          </div>
        </div>

        <div>
          <div class="oficina-app-vagas-box" style="margin-bottom: 0.65rem;">
            <div class="oficina-app-vagas-info">
              <span>Ocupação: <strong>${ocup} / ${cap} vagas</strong></span>
              <span class="${isEsgotada ? 'vagas-esgotada' : (pct >= 75 ? 'vagas-atencao' : 'vagas-ok')}">${disp} livres (${100 - pct}%)</span>
            </div>
            <div class="oficina-app-bar-track">
              <div class="oficina-app-bar-fill" style="width: ${pct}%; background: ${barColor};"></div>
            </div>
          </div>
          <div class="oficina-app-actions">
            ${actionBtnHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    ${selectorHtml}
    ${minhaOficinaHtml}
    <div class="oficinas-grid-user">
      ${cardsHtml}
    </div>
  `;
}

window.inscreverEmOficinaParticipante = async function (oficinaId, nomeOficina, jaTemOficina) {
  const msg = jaTemOficina
    ? `Deseja transferir sua inscrição atual para a oficina "${nomeOficina}"?`
    : `Confirmar sua inscrição na oficina "${nomeOficina}"?`;
  if (!confirm(msg)) return;

  try {
    const res = await API.request(`/oficinas/${oficinaId}/inscrever`, {
      method: 'POST'
    });
    showToast(res.message || 'Inscrição na oficina confirmada com sucesso!', 'success');
    await carregarOficinasParticipante();
  } catch (err) {
    showToast(err.message || 'Não foi possível concluir a inscrição na oficina.', 'error');
    await carregarOficinasParticipante();
  }
};

window.cancelarInscricaoOficinaParticipante = async function (oficinaId, nomeOficina) {
  if (!confirm(`Deseja realmente cancelar sua participação na oficina "${nomeOficina}" e liberar sua vaga?`)) return;

  try {
    const res = await API.request(`/oficinas/${oficinaId}/cancelar-minha-inscricao`, {
      method: 'DELETE'
    });
    showToast(res.message || 'Sua inscrição na oficina foi cancelada.', 'info');
    await carregarOficinasParticipante();
  } catch (err) {
    showToast(err.message || 'Erro ao cancelar inscrição na oficina.', 'error');
  }
};


// ==========================================
// MODAL DE DETALHES COMPLETOS DA OFICINA
// ==========================================
window.abrirModalOficina = function (oficinaId) {
  if (!currentOficinasData || !currentOficinasData.eventos) return;

  let oficinaEncontrada = null;
  let eventoDela = null;

  for (const ev of currentOficinasData.eventos) {
    if (ev.minha_oficina && Number(ev.minha_oficina.id) === Number(oficinaId)) {
      oficinaEncontrada = ev.minha_oficina;
      eventoDela = ev;
      break;
    }
    const achou = (ev.oficinas || []).find(o => Number(o.id) === Number(oficinaId));
    if (achou) {
      oficinaEncontrada = achou;
      eventoDela = ev;
      break;
    }
  }

  if (!oficinaEncontrada) return;

  const badgeEvento = document.getElementById('modal-oficina-badge-evento');
  const titulo = document.getElementById('modal-oficina-titulo');
  const pills = document.getElementById('modal-oficina-pills');
  const desc = document.getElementById('modal-oficina-descricao');
  const vagasBox = document.getElementById('modal-oficina-vagas-box');
  const actions = document.getElementById('modal-oficina-actions');

  if (badgeEvento) {
    badgeEvento.textContent = eventoDela ? eventoDela.evento_titulo : 'Oficina do Evento';
  }
  if (titulo) {
    titulo.textContent = oficinaEncontrada.nome;
  }

  if (pills) {
    let pillsHtml = '';
    if (oficinaEncontrada.ministrante) {
      pillsHtml += `
        <span class="oficina-meta-pill">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span>Ministrante: <strong>${escapeHtmlOficina(oficinaEncontrada.ministrante)}</strong></span>
        </span>
      `;
    }
    if (oficinaEncontrada.horario) {
      pillsHtml += `
        <span class="oficina-meta-pill">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>Horário: <strong>${escapeHtmlOficina(oficinaEncontrada.horario)}</strong></span>
        </span>
      `;
    }
    if (oficinaEncontrada.local) {
      pillsHtml += `
        <span class="oficina-meta-pill">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <span>Sala/Local: <strong>${escapeHtmlOficina(oficinaEncontrada.local)}</strong></span>
        </span>
      `;
    }
    pills.innerHTML = pillsHtml || '<span style="font-size: 0.8rem; color: var(--text-muted);">Informações adicionais em breve</span>';
  }

  if (desc) {
    desc.textContent = oficinaEncontrada.descricao || 'Nenhuma descrição detalhada informada para esta oficina.';
  }

  const cap = Number(oficinaEncontrada.capacidade || 0);
  const ocup = Number(oficinaEncontrada.vagas_ocupadas || 0);
  const disp = Number(oficinaEncontrada.vagas_disponiveis || 0);
  const pct = cap > 0 ? Math.min(100, Math.round((ocup / cap) * 100)) : 0;
  const isInscrito = Boolean(oficinaEncontrada.inscrito_nesta || (eventoDela && eventoDela.minha_oficina && Number(eventoDela.minha_oficina.id) === Number(oficinaEncontrada.id)));
  const isEsgotada = Boolean(oficinaEncontrada.esgotada);
  const jaTemOutra = Boolean(eventoDela && eventoDela.minha_oficina && !isInscrito);

  let barColor = '#10B981';
  if (isEsgotada) barColor = '#EF4444';
  else if (pct >= 75) barColor = '#F59E0B';

  if (vagasBox) {
    vagasBox.innerHTML = `
      <div class="oficina-vagas-box" style="margin-bottom: 0;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; font-weight: 700; font-variant-numeric: tabular-nums;">
          <span style="color: var(--text-muted);">Ocupação: <strong style="color: var(--text-main);">${ocup} / ${cap} vagas</strong></span>
          <span style="color: ${isEsgotada ? '#DC2626' : '#059669'};">${disp} livres (${100 - pct}%)</span>
        </div>
        <div class="oficina-vagas-bar-track" style="height: 7px; margin-top: 0.4rem;">
          <div class="oficina-vagas-bar-fill" style="width: ${pct}%; background: ${barColor};"></div>
        </div>
      </div>
    `;
  }

  if (actions) {
    if (isInscrito) {
      actions.innerHTML = `
        <button type="button" class="btn btn-outline" style="width: 100%; border-color: #DC2626; color: #DC2626; font-weight: 700;" onclick="fecharModalOficina(); cancelarInscricaoOficinaParticipante(${oficinaEncontrada.id}, '${escapeHtmlOficina(oficinaEncontrada.nome)}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          <span>Cancelar Minha Inscrição</span>
        </button>
      `;
    } else if (isEsgotada) {
      actions.innerHTML = `
        <button type="button" class="btn btn-outline" disabled style="width: 100%; opacity: 0.6; cursor: not-allowed;">
          <span>Vagas Esgotadas</span>
        </button>
      `;
    } else if (jaTemOutra) {
      actions.innerHTML = `
        <button type="button" class="btn btn-outline" style="width: 100%; border-color: var(--primary); color: var(--primary); font-weight: 700;" onclick="fecharModalOficina(); inscreverEmOficinaParticipante(${oficinaEncontrada.id}, '${escapeHtmlOficina(oficinaEncontrada.nome)}', true)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
          <span>Trocar para esta Oficina</span>
        </button>
      `;
    } else {
      actions.innerHTML = `
        <button type="button" class="btn btn-primary" style="width: 100%; font-weight: 700;" onclick="fecharModalOficina(); inscreverEmOficinaParticipante(${oficinaEncontrada.id}, '${escapeHtmlOficina(oficinaEncontrada.nome)}', false)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
          <span>Inscrever-se nesta Oficina</span>
        </button>
      `;
    }
  }

  const modal = document.getElementById('oficina-detalhes-modal');
  if (modal) modal.style.display = 'flex';
};

window.fecharModalOficina = function () {
  const modal = document.getElementById('oficina-detalhes-modal');
  if (modal) modal.style.display = 'none';
};

window.fecharModalOficinaBackdrop = function (e) {
  if (e.target && e.target.id === 'oficina-detalhes-modal') {
    window.fecharModalOficina();
  }
};
