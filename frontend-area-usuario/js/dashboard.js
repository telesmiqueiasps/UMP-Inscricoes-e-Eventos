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

  // Inicializar carregamento de dados
  await loadDashboard();
});

async function loadDashboard() {
  try {
    const data = await API.request('/usuario/dashboard');
    currentDashboardData = data;

    // 1. Nome de boas-vindas
    if (welcomeUser && data.usuario) welcomeUser.textContent = `Olá, ${data.usuario.nome}!`;

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
      ...inscricoes.map(ins => ({ key: `ins_${ins.id}`, type: 'inscricao', data: ins })),
      ...triagens.map(tr => ({ key: `tr_${tr.id}`, type: 'triagem', data: tr }))
    ];

    const selectorContainer = document.getElementById('dashboard-selector-container');
    const eventSelect = document.getElementById('dashboard-event-select');

    if (items.length > 0) {
      if (items.length > 1) {
        if (selectorContainer) selectorContainer.style.display = 'flex';
        if (eventSelect) {
          eventSelect.innerHTML = items.map(item => {
            if (item.type === 'inscricao') {
              const ins = item.data;
              return `<option value="ins_${ins.id}">${ins.evento_titulo || 'Evento'} (Inscrito - ${ins.status})</option>`;
            } else {
              const tr = item.data;
              return `<option value="tr_${tr.id}">${tr.evento_titulo || 'Evento'} (Aguardando Pagamento)</option>`;
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
          <a href="https://inscricoessinodalpb.netlify.app/" class="btn btn-primary" style="margin-top: 1.25rem;">
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
window.changeDashboardEvent = function(eventKey) {
  activeEventKey = eventKey;
  renderActiveItem(activeEventKey);
};

window.selecionarEventosDashboard = function(eventKey) {
  switchTab('tab-painel');
  changeDashboardEvent(eventKey);
};

function renderActiveItem(eventKey) {
  if (!currentDashboardData || !eventKey) return;

  if (eventKey.startsWith('ins_')) {
    const insId = parseInt(eventKey.replace('ins_', ''));
    renderActiveRegistration(insId);
  } else if (eventKey.startsWith('tr_')) {
    const trId = parseInt(eventKey.replace('tr_', ''));
    renderActiveTriagem(trId);
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
      `<button class="btn btn-outline" style="margin-top: 1.25rem; width: 100%; border-color: var(--primary); color: var(--primary); font-weight: 600;" onclick="openQrModal('${ins.codigo_checkin}', '${(ins.evento_titulo || '').replace(/'/g, "\\'")}')">
         <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3"/></svg>
         <span>Ver QR Code de Check-in</span>
       </button>` : '';
    
    registrationCard.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
        <div>
          <span class="badge ${statusBadge}">${ins.status}</span>
          <h3 class="card-title" style="margin-top: 0.5rem; font-size: 1.2rem;">${ins.evento_titulo || 'Evento'}</h3>
        </div>
        <div style="font-size: 1.25rem; font-weight: 800; color: var(--primary); font-family: 'Plus Jakarta Sans', sans-serif;">
          ${valorFmt}
        </div>
      </div>
      <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.65rem; line-height: 1.5;">
        📍 Local: ${ins.evento_local || 'A definir'}<br>
        💳 Forma de Pagamento: <strong>${formatarFormaPagamento(ins.forma_pagamento, ins.capture_method)}</strong>
      </p>
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
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
        <div>
          <span class="badge badge-warning">AGUARDANDO PAGAMENTO</span>
          <h3 class="card-title" style="margin-top: 0.5rem; font-size: 1.2rem;">${tr.evento_titulo || 'Evento'}</h3>
        </div>
        <div style="font-size: 1.25rem; font-weight: 800; color: var(--primary); font-family: 'Plus Jakarta Sans', sans-serif;">
          ${valorFmt}
        </div>
      </div>
      <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.65rem; line-height: 1.5;">
        📍 Local: ${tr.evento_local || 'A definir'}<br>
        💳 Forma de Pagamento Escolhida: <strong>${formatarFormaPagamento(tr.forma_pagamento)}</strong>
      </p>
      <div style="margin-top: 1rem; padding: 0.85rem; background: #FEF3C7; border: 1px solid #F59E0B; border-radius: var(--radius-md); font-size: 0.85rem; color: #92400E; text-align: left; line-height: 1.4;">
        <strong>⚠️ Inscrição Iniciada!</strong><br>
        Atenção: <strong>sua vaga NÃO está reservada até que você conclua o pagamento</strong> da 1ª parcela (ou valor total).
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
            <span>Pagar Parcela</span>
          </a>` : 
          `<button class="btn btn-outline btn-sm" onclick="copiarPixString('${parc.copia_cola_pix}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            <span>Copiar Pix</span>
          </button>`
        ) : '';

      return `
        <div class="parcela-card-item">
          <div class="top-row">
            <span style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">Parcela ${parc.numero}</span>
            <span class="badge badge-warning">PENDENTE</span>
          </div>
          <div class="info-row">
            <span>📅 Vencimento: <strong>${dtVenc}</strong></span>
            <span>Valor: <strong style="color: var(--primary); font-size: 0.95rem;">${valorParcFmt}</strong></span>
          </div>
          <div class="actions-row">
            ${actionBtnMobile}
            <a href="${pdfUrl}" target="_blank" class="btn btn-outline btn-sm" style="text-decoration: none;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
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
              <div style="display: flex; gap: 0.5rem; align-items: center;">
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
        const dtVenc = parc.vencimento ? new Date(parc.vencimento + (parc.vencimento.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('pt-BR') : 'N/A';

        return `
          <div class="parcela-card-item">
            <div class="top-row">
              <span style="font-weight: 700; font-size: 0.95rem;">Parcela ${parc.numero}</span>
              <span class="badge ${getStatusBadge(parc.status)}">${parc.status}</span>
            </div>
            <div class="info-row">
              <span>📅 Vencimento: <strong>${dtVenc}</strong></span>
              <span>Valor: <strong style="color: var(--primary); font-size: 0.95rem;">${valorParcFmt}</strong></span>
            </div>
            <div class="actions-row">
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
              ${!isCancelled ? 
                `<a href="${pdfUrl}" target="_blank" class="btn btn-outline btn-sm" style="text-decoration: none;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <span>Carnê PDF</span>
                </a>` : ''
              }
            </div>
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

      return `
        <div class="card" style="margin-bottom: 1.5rem; border: 1.5px solid #F59E0B; background: #FFFDF5; box-shadow: none;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem;">
            <div>
              <span class="badge badge-warning">AGUARDANDO PAGAMENTO</span>
              <h3 class="card-title" style="margin-top: 0.5rem; font-size: 1.15rem;">${tr.evento_titulo || 'Evento'}</h3>
              <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem;">
                📅 Início da solicitação: ${dataReg}<br>
                📍 Local: ${tr.evento_local || 'A definir'}<br>
                💳 Forma de Pagamento: <strong>${formatarFormaPagamento(tr.forma_pagamento)}</strong>
              </p>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 1.15rem; font-weight: 800; color: var(--primary); font-family: 'Plus Jakarta Sans', sans-serif;">${valorTotalFmt}</div>
              <div style="font-size: 0.8rem; color: #D97706; font-weight: 600; margin-top: 0.25rem;">Pagamento Pendente</div>
            </div>
          </div>
          <div style="margin-top: 1rem; padding: 0.75rem 1rem; background: #FEF3C7; border-radius: var(--radius-md); font-size: 0.85rem; color: #92400E; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
            <span>⚠️ <strong>Atenção:</strong> sua vaga NÃO está reservada até que você conclua o pagamento.</span>
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
      const dataReg = new Date(ins.created_at).toLocaleDateString('pt-BR');
      let badgeClass = 'badge-warning';
      if (ins.status === 'CONFIRMADA') badgeClass = 'badge-success';
      else if (ins.status === 'CANCELADA' || ins.status === 'CANCELADO') badgeClass = 'badge-info';
      else if (ins.status === 'VENCIDA' || ins.status === 'VENCIDO') badgeClass = 'badge-danger';

      return `
        <div class="card" style="margin-bottom: 1.5rem; border: 1.5px solid var(--border-color); background: #FFFFFF;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem;">
            <div>
              <span class="badge ${badgeClass}">${ins.status}</span>
              <h3 class="card-title" style="margin-top: 0.5rem; font-size: 1.15rem;">${ins.evento_titulo}</h3>
              <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem;">
                📅 Data da Inscrição: ${dataReg}<br>
                📍 Local do Evento: ${ins.evento_local || 'A definir'}
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

window.switchTab = function(tabId) {
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
  } else if (tabId === 'tab-senha') {
    const el = document.getElementById('menu-senha');
    if (el) el.classList.add('active');
  }
};

window.openEditModal = function() {
  if (!currentDashboardData || !currentDashboardData.usuario) return;
  const user = currentDashboardData.usuario;
  document.getElementById('edit-nome').value = user.nome || '';
  document.getElementById('edit-email').value = user.email || '';
  document.getElementById('edit-telefone').value = user.telefone || '';
  document.getElementById('edit-senha').value = '';
  const modal = document.getElementById('edit-profile-modal');
  if (modal) modal.style.display = 'flex';
};

window.closeEditModal = function() {
  const modal = document.getElementById('edit-profile-modal');
  if (modal) modal.style.display = 'none';
};

window.salvarPerfil = async function(e) {
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

window.atualizarSenhaParticipante = async function(e) {
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

window.openQrModal = function(codigo, eventoTitulo) {
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

window.closeQrModal = function() {
  const modal = document.getElementById('qr-code-modal');
  if (modal) modal.style.display = 'none';
};
