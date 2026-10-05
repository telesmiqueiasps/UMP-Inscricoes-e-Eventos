let selectedEventoId = null;
let eventoAtual = null;
let cachedInscricoesList = [];
let allEventsList = [];

// Controle de Paginação
let currentPageInscricoes = 1;
let currentPagePagamentos = 1;
let currentPagePresenca = 1;
const itemsPerPage = 20;

window.execEditorCommand = function(command, arg = null) {
  document.execCommand(command, false, arg);
  document.getElementById('ev-descricao-editor').focus();
};

document.addEventListener('DOMContentLoaded', async () => {
  const token = API.getToken();
  if (!token) {
    window.location.href = 'index.html';
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  selectedEventoId = urlParams.get('evento_id');

  if (!selectedEventoId) {
    showToast('Nenhum evento selecionado.', 'error');
    setTimeout(() => window.location.href = 'index.html', 1500);
    return;
  }

  // Inicializar o carregamento
  await loadEventoInfo();
  await loadInscricoes();
  await loadPagamentos();
  await loadListaPresenca();
});

// --- Tabs Switcher ---
window.switchSubTab = function(tabId, btn) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  
  document.getElementById(tabId).classList.add('active');
  btn.classList.add('active');

  // Parar scanner de QR Code caso saia da aba de check-in
  if (tabId !== 'pane-checkin') {
    pararLeitorCheckin();
  }
};

// --- Carregar Detalhes do Evento ---
async function loadEventoInfo() {
  try {
    eventoAtual = await API.request(`/eventos/publico/${selectedEventoId}`);
    allEventsList = [eventoAtual];

    // Preencher cabeçalho
    document.getElementById('event-detail-title').textContent = eventoAtual.titulo;
    
    const dataInicio = new Date(eventoAtual.data_inicio).toLocaleDateString('pt-BR');
    const valorFmt = parseFloat(eventoAtual.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('event-detail-subtitle').textContent = `Início: ${dataInicio} • Valor: ${valorFmt} • Local: ${eventoAtual.local || 'A definir'}`;

    // Preencher Formulário de Edição (Tab 3)
    document.getElementById('evento-id').value = eventoAtual.id;
    document.getElementById('ev-titulo').value = eventoAtual.titulo;
    document.getElementById('ev-descricao-editor').innerHTML = eventoAtual.descricao || '';
    
    const formatDt = (isoStr) => isoStr ? isoStr.substring(0, 16) : '';
    document.getElementById('ev-inicio').value = formatDt(eventoAtual.data_inicio);
    document.getElementById('ev-fim').value = formatDt(eventoAtual.data_fim);
    
    document.getElementById('ev-local').value = eventoAtual.local || '';
    document.getElementById('ev-valor').value = eventoAtual.valor;
    document.getElementById('ev-max-part').value = eventoAtual.max_participantes || '';
    document.getElementById('ev-ativo').checked = eventoAtual.ativo;
    document.getElementById('ev-whatsapp-link').value = eventoAtual.whatsapp_grupo_link || '';

    document.querySelectorAll('.ev-form-field').forEach(cb => {
      cb.checked = eventoAtual.campos_formulario ? eventoAtual.campos_formulario.split(',').includes(cb.value) : false;
    });

    const fotosArray = eventoAtual.fotos ? eventoAtual.fotos.split(',') : [];
    for (let i = 1; i <= 8; i++) {
      const val = fotosArray[i - 1] || '';
      const input = document.getElementById(`ev-foto-${i}`);
      if (input) {
        input.value = val;
        updateMediaPreview(i, val);
      }
    }

  } catch (err) {
    showToast('Erro ao carregar detalhes do evento.', 'error');
  }
}

// --- Controle de Paginação (Helper Genérico) ---
function renderPaginationControls(containerId, currentPage, totalItems, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  
  if (totalItems <= itemsPerPage) {
    container.innerHTML = `
      <div style="font-size: 0.8rem; color: var(--text-muted);">Mostrando todos os ${totalItems} registros</div>
      <div></div>
    `;
    return;
  }

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  container.innerHTML = `
    <div style="font-size: 0.8rem; color: var(--text-muted);">
      Mostrando <strong>${startItem}</strong> a <strong>${endItem}</strong> de <strong>${totalItems}</strong> registros
    </div>
    <div style="display: flex; gap: 0.5rem; align-items: center;">
      <button class="btn btn-outline" style="padding: 0.25rem 0.75rem; font-size: 0.8rem; height: 32px;" ${currentPage === 1 ? 'disabled' : ''} onclick="${onPageChange}(${currentPage - 1})">
        &laquo; Anterior
      </button>
      <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-dark);">Página ${currentPage} de ${totalPages}</span>
      <button class="btn btn-outline" style="padding: 0.25rem 0.75rem; font-size: 0.8rem; height: 32px;" ${currentPage === totalPages ? 'disabled' : ''} onclick="${onPageChange}(${currentPage + 1})">
        Próxima &raquo;
      </button>
    </div>
  `;
}

// --- Carregar Inscrições ---
window.loadInscricoes = async function() {
  const status = document.getElementById('filter-status').value;
  const search = document.getElementById('filter-search').value;

  let queryStr = `?page=1&limit=500&evento_id=${selectedEventoId}`;
  if (status) queryStr += `&status_filtro=${status}`;
  if (search) queryStr += `&search=${encodeURIComponent(search)}`;

  try {
    const data = await API.request(`/admin/inscricoes${queryStr}`);
    cachedInscricoesList = data;
    currentPageInscricoes = 1;
    renderInscricoesTable();
  } catch (err) {
    const container = document.getElementById('inscricoes-table-body');
    if (container) {
      container.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-danger);">Erro ao carregar inscrições.</td></tr>`;
    }
  }
};

// --- Ícones SVG do Sistema (Sem Emojis) ---
const ICONS = {
  eye: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  check: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  checkCircle: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>`,
  x: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  clock: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  whatsapp: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`,
  copy: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  printer: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>`,
  user: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  church: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 7 4 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9l4-2"/><path d="M14 22v-4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v4"/><path d="M18 22V5l-6-3-6 3v17"/><path d="M12 7v5"/><path d="M10 9h4"/></svg>`,
  health: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  package: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
  creditCard: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
  fileText: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  alertTriangle: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  droplet: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`,
  undo: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`
};

// --- Helpers de Formatação e Utilitários ---
function obterIniciaisNome(nome) {
  if (!nome) return 'U';
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function formatarCPF(cpf) {
  if (!cpf) return '';
  const num = cpf.replace(/\D/g, '');
  if (num.length === 11) {
    return num.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  return cpf;
}

function formatarTelefone(tel) {
  if (!tel) return '';
  const num = tel.replace(/\D/g, '');
  if (num.length === 11) {
    return num.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  if (num.length === 10) {
    return num.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  return tel;
}

function calcularIdadeTexto(dataStr) {
  if (!dataStr) return '-';
  let ano, mes, dia;
  if (dataStr.includes('-')) {
    const parts = dataStr.split('T')[0].split('-');
    ano = parseInt(parts[0], 10);
    mes = parseInt(parts[1], 10) - 1;
    dia = parseInt(parts[2], 10);
  } else if (dataStr.includes('/')) {
    const parts = dataStr.split('/');
    dia = parseInt(parts[0], 10);
    mes = parseInt(parts[1], 10) - 1;
    ano = parseInt(parts[2], 10);
  } else {
    return dataStr;
  }

  if (isNaN(ano) || isNaN(mes) || isNaN(dia)) return dataStr;

  const hoje = new Date();
  let idade = hoje.getFullYear() - ano;
  const m = hoje.getMonth() - mes;
  if (m < 0 || (m === 0 && hoje.getDate() < dia)) {
    idade--;
  }
  const dataFmt = `${String(dia).padStart(2, '0')}/${String(mes + 1).padStart(2, '0')}/${ano}`;
  if (!isNaN(idade) && idade >= 0 && idade < 120) {
    return `${dataFmt} (${idade} anos)`;
  }
  return dataFmt;
}

function formatarDataHora(dt) {
  if (!dt) return '-';
  try {
    const d = new Date(dt);
    if (isNaN(d.getTime())) return dt;
    return d.toLocaleString('pt-BR');
  } catch (e) {
    return dt;
  }
}

window.copiarTextoParaClipboard = function(texto, label = 'Dado') {
  if (!texto) return;
  navigator.clipboard.writeText(texto).then(() => {
    showToast(`${label} copiado!`, 'success');
  }).catch(() => {
    showToast('Não foi possível copiar.', 'warning');
  });
};

// Fechar modal com tecla ESC
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.fecharModalInscricaoDetalhes();
  }
});

window.fecharModalInscricaoBackdrop = function(e) {
  if (e.target && e.target.id === 'modal-detalhes-inscricao') {
    window.fecharModalInscricaoDetalhes();
  }
};

window.fecharModalInscricaoDetalhes = function() {
  const modal = document.getElementById('modal-detalhes-inscricao');
  if (modal) {
    modal.style.display = 'none';
  }
};

// --- Renderizar Tabela de Inscrições ---
window.renderInscricoesTable = function() {
  const container = document.getElementById('inscricoes-table-body');
  const tableHead = document.getElementById('inscricoes-table-head');
  if (!container) return;

  // Cabeçalho Limpo e Otimizado
  if (tableHead) {
    tableHead.innerHTML = `
      <tr>
        <th style="width: 55px;">ID</th>
        <th>Participante</th>
        <th>Origem / Igreja</th>
        <th>Pagamento & Valor</th>
        <th>Status</th>
        <th>Check-in</th>
        <th class="col-acoes">Ações</th>
      </tr>
    `;
  }

  const totalItems = cachedInscricoesList.length;
  const start = (currentPageInscricoes - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const paginatedData = cachedInscricoesList.slice(start, end);

  // Preencher Linhas
  if (totalItems === 0) {
    container.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2.5rem; color: var(--text-muted);">Nenhuma inscrição encontrada para este evento.</td></tr>`;
    renderPaginationControls('inscricoes-pagination-container', currentPageInscricoes, totalItems, 'changePageInscricoes');
    return;
  }

  container.innerHTML = paginatedData.map(ins => {
    const valorFmt = parseFloat(ins.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const statusBadge = ins.status === 'CONFIRMADA' ? 'badge-success' : ins.status === 'PENDENTE' ? 'badge-warning' : 'badge-danger';
    const user = ins.usuario || {};
    const extras = ins.dados_extras || {};
    const iniciais = obterIniciaisNome(user.nome || 'Participante');

    const cpfFormatado = formatarCPF(user.cpf || extras.cpf || '');
    const telFormatado = formatarTelefone(user.telefone || extras.telefone || '');
    
    // Contato secundário resumido
    let contatoResumo = user.email || '';
    if (telFormatado) {
      contatoResumo += (contatoResumo ? ' • ' : '') + telFormatado;
    } else if (cpfFormatado) {
      contatoResumo += (contatoResumo ? ' • CPF: ' : 'CPF: ') + cpfFormatado;
    }

    // Origem (Igreja / Presbitério / Cidade)
    const origemTexto = extras.igreja || extras.presbiterio || 'Origem não informada';
    const cidadeStr = extras.cidade ? `<div style="font-size:0.75rem; color:var(--text-muted);">${extras.cidade}</div>` : '';

    // Check-in Badge com Ícone SVG
    const checkinBadgeMini = ins.checkin_realizado ? 
      `<span class="badge badge-success" style="font-size:0.72rem; gap:0.25rem;">${ICONS.checkCircle} Checked-in</span>` : 
      `<span class="badge" style="background:#F1F5F9; color:var(--text-muted); border:1px solid #E2E8F0; font-size:0.72rem; gap:0.25rem;">${ICONS.clock} Ausente</span>`;

    return `
      <tr class="inscricao-row-interactive" onclick="abrirModalInscricaoDetalhes(${ins.id})" title="Clique para ver a ficha completa com as informações solicitadas">
        <td>
          <span style="font-weight: 700; color: var(--primary); font-size: 0.825rem;">#${ins.id}</span>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <div class="ficha-avatar" style="width: 32px; height: 32px; font-size: 0.775rem;">
              ${iniciais}
            </div>
            <div>
              <div style="font-weight: 700; color: var(--text-main); font-size: 0.88rem;">${user.nome || 'N/A'}</div>
              <div style="font-size: 0.73rem; color: var(--text-muted);">${contatoResumo || 'Sem contato adicional'}</div>
            </div>
          </div>
        </td>
        <td>
          <div style="font-size: 0.825rem; font-weight: 600; color: var(--text-main);">${origemTexto}</div>
          ${cidadeStr}
        </td>
        <td>
          <div style="font-size: 0.825rem; font-weight: 600; color: var(--text-main);">${formatarFormaPagamento(ins.forma_pagamento, ins.capture_method)}</div>
          <div style="font-size: 0.75rem; color: var(--primary); font-weight: 700;">${valorFmt}</div>
        </td>
        <td>
          <span class="badge ${statusBadge}">${ins.status}</span>
        </td>
        <td>
          ${checkinBadgeMini}
        </td>
        <td class="col-acoes" onclick="event.stopPropagation()">
          <div style="display: inline-flex; gap: 0.3rem; align-items: center;">
            <button class="btn-detalhes-inline" onclick="abrirModalInscricaoDetalhes(${ins.id})" title="Visualizar ficha">
              ${ICONS.eye}
              <span>Ficha</span>
            </button>
            ${ins.status !== 'CONFIRMADA' ? `<button class="btn-action-icon btn-action-confirm" title="Confirmar Inscrição" onclick="alterarStatusInscricao(${ins.id}, 'CONFIRMADA')">${ICONS.check}</button>` : ''}
            ${ins.status !== 'CANCELADA' ? `<button class="btn-action-icon btn-action-cancel" title="Cancelar Inscrição" onclick="alterarStatusInscricao(${ins.id}, 'CANCELADA')">${ICONS.x}</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  renderPaginationControls('inscricoes-pagination-container', currentPageInscricoes, totalItems, 'changePageInscricoes');
};

window.changePageInscricoes = function(page) {
  currentPageInscricoes = page;
  renderInscricoesTable();
};

window.alterarStatusInscricao = async function(id, novoStatus) {
  try {
    await API.request(`/admin/inscricoes/${id}/status?novo_status=${novoStatus}`, { method: 'PUT' });
    showToast(`Inscrição #${id} atualizada para ${novoStatus}!`, 'success');
    await loadInscricoes();
    // Se o modal estiver aberto com essa mesma inscrição, atualiza ele também
    const modal = document.getElementById('modal-detalhes-inscricao');
    if (modal && modal.style.display === 'flex') {
      window.abrirModalInscricaoDetalhes(id);
    }
  } catch (err) {}
};

// --- Modal de Ficha do Inscrito (Apenas Campos Solicitados no Formulário) ---
window.abrirModalInscricaoDetalhes = function(id) {
  const ins = cachedInscricoesList.find(i => i.id === id);
  if (!ins) {
    showToast('Inscrição não encontrada no cache.', 'error');
    return;
  }

  const modal = document.getElementById('modal-detalhes-inscricao');
  const conteudo = document.getElementById('modal-detalhes-conteudo');
  if (!modal || !conteudo) return;

  const user = ins.usuario || {};
  const extras = ins.dados_extras || {};
  const iniciais = obterIniciaisNome(user.nome || 'Participante');

  // Campos que foram configurados/solicitados no formulário do evento
  const camposConfigurados = (eventoAtual && eventoAtual.campos_formulario)
    ? eventoAtual.campos_formulario.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    : [];

  // Helper para verificar se um campo deve ser exibido:
  // Retorna true somente se foi solicitado no evento OU se possui valor preenchido na inscrição
  const deveExibirCampo = (nomeCampo) => {
    const nomeLower = nomeCampo.toLowerCase();
    const solicitadoNoEvento = camposConfigurados.includes(nomeLower);
    const temValorExtras = extras && extras[nomeCampo] !== undefined && extras[nomeCampo] !== null && String(extras[nomeCampo]).trim() !== '' && String(extras[nomeCampo]).trim() !== '-';
    
    if (nomeLower === 'cpf') {
      const temCpf = (user.cpf && user.cpf.trim() !== '') || temValorExtras;
      return solicitadoNoEvento || temCpf;
    }
    if (nomeLower === 'telefone') {
      const temTel = (user.telefone && user.telefone.trim() !== '') || temValorExtras;
      return solicitadoNoEvento || temTel;
    }
    return solicitadoNoEvento || temValorExtras;
  };

  const cpfFormatado = formatarCPF(user.cpf || extras.cpf || '');
  const telFormatado = formatarTelefone(user.telefone || extras.telefone || '');
  const telLimpo = (user.telefone || extras.telefone || '').replace(/\D/g, '');
  const whatsappLink = telLimpo ? `https://wa.me/55${telLimpo}?text=Ol%C3%A1%20${encodeURIComponent(user.nome || '')},%20tudo%20bem?%20Falamos%20da%20organiza%C3%A7%C3%A3o%20do%20evento%20${encodeURIComponent(eventoAtual?.titulo || 'UMP')}!` : null;

  const pastorTelLimpo = (extras.contato_pastor || '').replace(/\D/g, '');
  const pastorWhatsappLink = pastorTelLimpo ? `https://wa.me/55${pastorTelLimpo}` : null;

  const valorTotalFmt = parseFloat(ins.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dataCriacaoFmt = formatarDataHora(ins.created_at);
  const dataCheckinFmt = ins.checkin_data ? formatarDataHora(ins.checkin_data) : null;

  const statusBadge = ins.status === 'CONFIRMADA' ? 'badge-success' : ins.status === 'PENDENTE' ? 'badge-warning' : 'badge-danger';
  const checkinBadge = ins.checkin_realizado ? 
    `<span class="badge badge-success" style="font-size:0.75rem; padding: 0.35rem 0.75rem; gap: 0.35rem;">${ICONS.checkCircle} Checked-in (${dataCheckinFmt || 'Confirmado'})</span>` : 
    `<span class="badge" style="background:#F1F5F9; color:var(--text-muted); border:1px solid #E2E8F0; font-size:0.75rem; padding: 0.35rem 0.75rem; gap: 0.35rem;">${ICONS.clock} Ausente</span>`;

  // Buscar parcelas ou histórico de pagamento vinculado
  let pagamentosVinculados = ins.pagamentos || [];
  if ((!pagamentosVinculados || pagamentosVinculados.length === 0) && allPagamentosCached && allPagamentosCached.length > 0) {
    pagamentosVinculados = allPagamentosCached.filter(p => p.inscricao_id === id);
  }

  // --- Construção Dinâmica das Seções Solicitadas ---

  // 1. Dados Pessoais & Contato
  let camposPessoaisHTML = `
    <div class="ficha-item">
      <span class="ficha-item-label">Nome Completo</span>
      <span class="ficha-item-valor">${user.nome || '-'}</span>
    </div>
    <div class="ficha-item">
      <span class="ficha-item-label">E-mail</span>
      <span class="ficha-item-valor">
        ${user.email ? `
          <a href="mailto:${user.email}" style="color:var(--primary); text-decoration:none;">${user.email}</a>
          <button class="btn-copy-chip" onclick="copiarTextoParaClipboard('${user.email}', 'E-mail')" title="Copiar e-mail">${ICONS.copy}</button>
        ` : '-'}
      </span>
    </div>
  `;

  if (deveExibirCampo('cpf')) {
    camposPessoaisHTML += `
      <div class="ficha-item">
        <span class="ficha-item-label">CPF</span>
        <span class="ficha-item-valor">
          ${cpfFormatado || '-'}
          ${cpfFormatado ? `<button class="btn-copy-chip" onclick="copiarTextoParaClipboard('${cpfFormatado}', 'CPF')" title="Copiar CPF">${ICONS.copy}</button>` : ''}
        </span>
      </div>
    `;
  }

  if (deveExibirCampo('telefone')) {
    camposPessoaisHTML += `
      <div class="ficha-item">
        <span class="ficha-item-label">Telefone / WhatsApp</span>
        <span class="ficha-item-valor">
          ${telFormatado || '-'}
          ${whatsappLink ? `<a href="${whatsappLink}" target="_blank" style="margin-left:0.35rem; text-decoration:none; color:#10B981; vertical-align:middle;" title="Abrir WhatsApp">${ICONS.whatsapp}</a>` : ''}
        </span>
      </div>
    `;
  }

  if (deveExibirCampo('data_nascimento')) {
    camposPessoaisHTML += `
      <div class="ficha-item">
        <span class="ficha-item-label">Data de Nascimento / Idade</span>
        <span class="ficha-item-valor">${calcularIdadeTexto(extras.data_nascimento || '')}</span>
      </div>
    `;
  }

  if (deveExibirCampo('genero')) {
    camposPessoaisHTML += `
      <div class="ficha-item">
        <span class="ficha-item-label">Gênero</span>
        <span class="ficha-item-valor">${extras.genero || '-'}</span>
      </div>
    `;
  }

  if (deveExibirCampo('estado_civil')) {
    camposPessoaisHTML += `
      <div class="ficha-item">
        <span class="ficha-item-label">Estado Civil</span>
        <span class="ficha-item-valor">${extras.estado_civil || '-'}</span>
      </div>
    `;
  }

  // 2. Informações Eclesiásticas
  const camposEclesiasticos = ['igreja', 'presbiterio', 'cidade', 'nome_pastor', 'contato_pastor', 'cargo_federacao'];
  const exibirEclesiastico = camposEclesiasticos.some(deveExibirCampo);
  let secaoEclesiasticaHTML = '';

  if (exibirEclesiastico) {
    let itensEclHTML = '';
    if (deveExibirCampo('igreja')) {
      itensEclHTML += `
        <div class="ficha-item">
          <span class="ficha-item-label">Igreja / Congregação</span>
          <span class="ficha-item-valor destaque">${extras.igreja || '-'}</span>
        </div>
      `;
    }
    if (deveExibirCampo('presbiterio')) {
      itensEclHTML += `
        <div class="ficha-item">
          <span class="ficha-item-label">Presbitério</span>
          <span class="ficha-item-valor">${extras.presbiterio || '-'}</span>
        </div>
      `;
    }
    if (deveExibirCampo('cidade')) {
      itensEclHTML += `
        <div class="ficha-item">
          <span class="ficha-item-label">Cidade / UF</span>
          <span class="ficha-item-valor">${extras.cidade || '-'}</span>
        </div>
      `;
    }
    if (deveExibirCampo('nome_pastor')) {
      itensEclHTML += `
        <div class="ficha-item">
          <span class="ficha-item-label">Pastor Responsável</span>
          <span class="ficha-item-valor">${extras.nome_pastor || '-'}</span>
        </div>
      `;
    }
    if (deveExibirCampo('contato_pastor')) {
      itensEclHTML += `
        <div class="ficha-item">
          <span class="ficha-item-label">Contato do Pastor</span>
          <span class="ficha-item-valor">
            ${extras.contato_pastor ? formatarTelefone(extras.contato_pastor) : '-'}
            ${pastorWhatsappLink ? `<a href="${pastorWhatsappLink}" target="_blank" style="margin-left:0.35rem; text-decoration:none; color:#10B981; vertical-align:middle;" title="Conversar no WhatsApp">${ICONS.whatsapp}</a>` : ''}
          </span>
        </div>
      `;
    }
    if (deveExibirCampo('cargo_federacao')) {
      itensEclHTML += `
        <div class="ficha-item">
          <span class="ficha-item-label">Cargo na Federação / Igreja</span>
          <span class="ficha-item-valor">${extras.cargo_federacao || '-'}</span>
        </div>
      `;
    }

    secaoEclesiasticaHTML = `
      <div class="ficha-secao">
        <div class="ficha-secao-titulo">
          <h4>${ICONS.church} Informações Eclesiásticas</h4>
        </div>
        <div class="ficha-grid-3">
          ${itensEclHTML}
        </div>
      </div>
    `;
  }

  // 3. Saúde, Emergência & Alimentação
  const camposSaude = ['tipo_sanguineo', 'contato_emergencia', 'alergias', 'medicamento_continuo', 'restricao_alimentar'];
  const exibirSaude = camposSaude.some(deveExibirCampo);
  let secaoSaudeHTML = '';

  if (exibirSaude) {
    let itensSaudeHTML = '';
    if (deveExibirCampo('tipo_sanguineo')) {
      itensSaudeHTML += `
        <div class="ficha-item">
          <span class="ficha-item-label">Tipo Sanguíneo</span>
          <span class="ficha-item-valor">
            ${extras.tipo_sanguineo ? `<span class="badge" style="background:#FEE2E2; color:#B91C1C; border:1px solid #FCA5A5; font-weight:800; font-size:0.78rem; gap:0.25rem;">${ICONS.droplet} ${extras.tipo_sanguineo}</span>` : '-'}
          </span>
        </div>
      `;
    }
    if (deveExibirCampo('contato_emergencia')) {
      itensSaudeHTML += `
        <div class="ficha-item">
          <span class="ficha-item-label">Contato(s) de Emergência</span>
          <span class="ficha-item-valor" style="font-weight: 700; color: #DC2626;">
            ${extras.contato_emergencia || '-'}
          </span>
        </div>
      `;
    }
    if (deveExibirCampo('alergias')) {
      itensSaudeHTML += `
        <div class="ficha-item" style="grid-column: 1 / -1;">
          <span class="ficha-item-label">Alergias</span>
          <div style="margin-top: 0.15rem;">
            ${extras.alergias ? `
              <div style="background:#FEF2F2; border:1px solid #FECACA; color:#B91C1C; padding:0.4rem 0.65rem; border-radius:var(--radius-sm); font-size:0.8rem; font-weight:600; display:inline-flex; align-items:center; gap:0.35rem;">
                ${ICONS.alertTriangle}
                <span>${extras.alergias}</span>
              </div>
            ` : '<span style="color:var(--text-muted); font-size:0.825rem;">Nenhuma informada</span>'}
          </div>
        </div>
      `;
    }
    if (deveExibirCampo('medicamento_continuo')) {
      itensSaudeHTML += `
        <div class="ficha-item">
          <span class="ficha-item-label">Medicamento Contínuo</span>
          <span class="ficha-item-valor">${extras.medicamento_continuo || '-'}</span>
        </div>
      `;
    }
    if (deveExibirCampo('restricao_alimentar')) {
      itensSaudeHTML += `
        <div class="ficha-item">
          <span class="ficha-item-label">Restrição Alimentar</span>
          <span class="ficha-item-valor">${extras.restricao_alimentar || '-'}</span>
        </div>
      `;
    }

    secaoSaudeHTML = `
      <div class="ficha-secao" style="border-left: 3px solid #EF4444;">
        <div class="ficha-secao-titulo">
          <h4>${ICONS.health} Saúde, Emergência & Alimentação</h4>
        </div>
        <div class="ficha-grid-2">
          ${itensSaudeHTML}
        </div>
      </div>
    `;
  }

  // 4. Logística do Evento & Check-in
  let itensLogisticaHTML = '';
  if (deveExibirCampo('tamanho_camiseta')) {
    itensLogisticaHTML += `
      <div class="ficha-item">
        <span class="ficha-item-label">Tamanho da Camiseta</span>
        <span class="ficha-item-valor">
          ${extras.tamanho_camiseta ? `
            <span class="badge" style="background:#EDE9FE; color:#6D28D9; border:1px solid #DDD6FE; font-size:0.78rem; font-weight:800;">${extras.tamanho_camiseta}</span>
          ` : '-'}
        </span>
      </div>
    `;
  }
  if (deveExibirCampo('dias_estadia')) {
    itensLogisticaHTML += `
      <div class="ficha-item">
        <span class="ficha-item-label">Dia da Chegada / Estadia</span>
        <span class="ficha-item-valor">${extras.dias_estadia || '-'}</span>
      </div>
    `;
  }

  // Código de Check-in e Situação (sempre fazem parte do controle do evento)
  itensLogisticaHTML += `
    <div class="ficha-item">
      <span class="ficha-item-label">Código de Check-in</span>
      <span class="ficha-item-valor">
        ${ins.codigo_checkin ? `
          <code style="background:#F1F5F9; padding:2px 6px; border-radius:4px; font-weight:700; color:var(--primary); font-size:0.825rem;">${ins.codigo_checkin}</code>
          <button class="btn-copy-chip" onclick="copiarTextoParaClipboard('${ins.codigo_checkin}', 'Código Check-in')" title="Copiar código">${ICONS.copy}</button>
        ` : '-'}
      </span>
    </div>

    <div class="ficha-item" style="grid-column: 1 / -1;">
      <span class="ficha-item-label">Situação do Check-in</span>
      <div style="margin-top: 0.25rem; display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap;">
        ${checkinBadge}
        <span style="font-size:0.775rem; color:var(--text-muted);">
          ${ins.checkin_realizado ? 'Confirmado na portaria.' : 'Aguardando entrada.'}
        </span>
      </div>
    </div>
  `;

  // 5. Outros Campos Extras Solicitados (dinâmicos adicionais)
  const todosPadroes = [
    'cpf', 'telefone', 'data_nascimento', 'genero', 'tamanho_camiseta', 
    'tipo_sanguineo', 'alergias', 'medicamento_continuo', 'contato_emergencia', 
    'restricao_alimentar', 'igreja', 'presbiterio', 'cidade', 'estado_civil', 
    'nome_pastor', 'contato_pastor', 'cargo_federacao', 'dias_estadia'
  ];
  const outrosCampos = Object.keys(extras).filter(k => !todosPadroes.includes(k) && deveExibirCampo(k));

  let secaoOutrosCamposHTML = '';
  if (outrosCampos.length > 0) {
    secaoOutrosCamposHTML = `
      <div class="ficha-secao">
        <div class="ficha-secao-titulo">
          <h4>${ICONS.fileText} Informações Adicionais</h4>
        </div>
        <div class="ficha-grid-2">
          ${outrosCampos.map(k => `
            <div class="ficha-item">
              <span class="ficha-item-label">${formatarLabelCampo(k)}</span>
              <span class="ficha-item-valor">${extras[k]}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Montar HTML Completo da Ficha
  conteudo.innerHTML = `
    <!-- Header -->
    <div class="modal-detalhes-header">
      <div style="display: flex; align-items: center; gap: 0.85rem;">
        <div class="ficha-avatar">
          ${iniciais}
        </div>
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <h3 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.15rem; font-weight: 800; color: var(--text-main); margin: 0;">
              ${user.nome || 'Participante'}
            </h3>
            <span class="badge ${statusBadge}">${ins.status}</span>
          </div>
          <div style="font-size: 0.775rem; color: var(--text-muted); margin-top: 0.15rem;">
            Inscrição <strong>#${ins.id}</strong> • ${dataCriacaoFmt}
          </div>
        </div>
      </div>
      <button type="button" class="btn-action-icon" onclick="fecharModalInscricaoDetalhes()" style="background:#F1F5F9; color:var(--text-muted);" title="Fechar (Esc)">
        ${ICONS.x}
      </button>
    </div>

    <!-- Barra de Ações Rápidas -->
    <div class="modal-detalhes-bar">
      <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
        ${whatsappLink ? `
          <a href="${whatsappLink}" target="_blank" rel="noopener noreferrer" class="btn btn-success" style="padding: 0 0.65rem; height: 30px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 0.35rem; text-decoration: none;">
            ${ICONS.whatsapp}
            <span>WhatsApp</span>
          </a>
        ` : ''}
        <button class="btn btn-outline" style="padding: 0 0.65rem; height: 30px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 0.35rem;" onclick="copiarFichaInscrito(${ins.id})">
          ${ICONS.copy}
          <span>Copiar Ficha</span>
        </button>
        <button class="btn btn-outline" style="padding: 0 0.65rem; height: 30px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 0.35rem;" onclick="imprimirFichaInscrito(${ins.id})">
          ${ICONS.printer}
          <span>Imprimir</span>
        </button>
      </div>

      <div>
        ${ins.checkin_realizado ? `
          <button class="btn btn-outline" style="padding: 0 0.65rem; height: 30px; font-size: 0.75rem; color: #DC2626; border-color: #FCA5A5; display: inline-flex; align-items: center; gap: 0.35rem;" onclick="toggleCheckinPeloCard(${ins.id})">
            ${ICONS.undo}
            <span>Desfazer Check-in</span>
          </button>
        ` : `
          <button class="btn btn-primary" style="padding: 0 0.65rem; height: 30px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 0.35rem;" onclick="toggleCheckinPeloCard(${ins.id})">
            ${ICONS.check}
            <span>Confirmar Check-in</span>
          </button>
        `}
      </div>
    </div>

    <!-- Corpo com Rolagem Funcional e Garantida -->
    <div class="modal-detalhes-body">
      
      <!-- Seção 1: Dados Pessoais & Contato -->
      <div class="ficha-secao">
        <div class="ficha-secao-titulo">
          <h4>${ICONS.user} Dados Pessoais & Contato</h4>
        </div>
        <div class="ficha-grid-3">
          ${camposPessoaisHTML}
        </div>
      </div>

      <!-- Seção 2: Informações Eclesiásticas (Apenas se solicitadas) -->
      ${secaoEclesiasticaHTML}

      <!-- Seção 3: Saúde, Emergência & Alimentação (Apenas se solicitadas) -->
      ${secaoSaudeHTML}

      <!-- Seção 4: Logística do Evento & Check-in -->
      <div class="ficha-secao">
        <div class="ficha-secao-titulo">
          <h4>${ICONS.package} Logística do Evento & Check-in</h4>
        </div>
        <div class="ficha-grid-3">
          ${itensLogisticaHTML}
        </div>
      </div>

      <!-- Seção 5: Dados Financeiros & Pagamento -->
      <div class="ficha-secao">
        <div class="ficha-secao-titulo">
          <h4>${ICONS.creditCard} Informações Financeiras & Pagamento</h4>
        </div>
        <div class="ficha-grid-3" style="margin-bottom: 0.85rem;">
          <div class="ficha-item">
            <span class="ficha-item-label">Valor Total</span>
            <span class="ficha-item-valor destaque" style="font-size: 1.05rem; color: #10B981;">
              ${valorTotalFmt}
            </span>
          </div>

          <div class="ficha-item">
            <span class="ficha-item-label">Forma de Pagamento</span>
            <span class="ficha-item-valor">${formatarFormaPagamento(ins.forma_pagamento, ins.capture_method)}</span>
          </div>

          <div class="ficha-item">
            <span class="ficha-item-label">Status da Inscrição</span>
            <span class="ficha-item-valor"><span class="badge ${statusBadge}">${ins.status}</span></span>
          </div>
        </div>

        <!-- Detalhamento de Parcelas se houver -->
        ${(() => {
          let parcelasLista = [];
          if (pagamentosVinculados && pagamentosVinculados.length > 0) {
            pagamentosVinculados.forEach(pag => {
              if (pag.parcelas && pag.parcelas.length > 0) {
                pag.parcelas.forEach(p => parcelasLista.push({ ...p, pagId: pag.id, forma: pag.forma_pagamento }));
              } else {
                parcelasLista.push({
                  id: pag.id,
                  numero: 1,
                  valor: pag.valor,
                  vencimento: pag.created_at ? pag.created_at.substring(0, 10) : '-',
                  status: pag.status,
                  isPagamentoUnico: true
                });
              }
            });
          }

          if (parcelasLista.length === 0) {
            return `<div style="font-size: 0.775rem; color: var(--text-muted); background: #F8FAFC; padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); border: 1px dashed var(--border-color);">Lançamento direto sem parcelas registradas.</div>`;
          }

          return `
            <div style="border-top: 1px solid #F1F5F9; padding-top: 0.75rem;">
              <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.4rem;">
                Detalhamento das Parcelas / Lançamentos (${parcelasLista.length})
              </div>
              <div class="table-responsive" style="border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
                <table style="font-size: 0.775rem;">
                  <thead>
                    <tr style="background: #F8FAFC;">
                      <th>Parcela</th>
                      <th>Valor</th>
                      <th>Vencimento</th>
                      <th>Status</th>
                      <th style="text-align: right;">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${parcelasLista.map(parc => {
                      const parcVal = parseFloat(parc.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                      const vencFmt = parc.vencimento && parc.vencimento !== '-' ? new Date(parc.vencimento + (parc.vencimento.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('pt-BR') : '-';
                      const badgeClass = parc.status === 'PAGO' ? 'badge-success' : (parc.status === 'CANCELADO' ? 'badge-danger' : 'badge-warning');
                      
                      let actionHtml = '-';
                      if (parc.status === 'PAGO') {
                        actionHtml = '<span style="color:#059669; font-weight:700;">Quitada</span>';
                      } else if (!parc.isPagamentoUnico && parc.status !== 'PAGO') {
                        actionHtml = `<button class="btn btn-success" style="padding: 0.15rem 0.45rem; font-size: 0.7rem; height:24px;" onclick="darBaixaParcelaPeloCard(${parc.id}, ${ins.id})">Dar Baixa</button>`;
                      }

                      return `
                        <tr>
                          <td><strong>${parc.numero ? `Parcela ${parc.numero}` : 'Pagamento'}</strong></td>
                          <td>${parcVal}</td>
                          <td>${vencFmt}</td>
                          <td><span class="badge ${badgeClass}">${parc.status}</span></td>
                          <td style="text-align: right;">${actionHtml}</td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          `;
        })()}
      </div>

      <!-- Seção 6: Outros Campos Extras (Se houver) -->
      ${secaoOutrosCamposHTML}

    </div>

    <!-- Footer com Ações -->
    <div class="modal-detalhes-footer">
      <div style="display: flex; gap: 0.45rem; align-items: center; flex-wrap: wrap;">
        <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Status:</span>
        ${ins.status !== 'CONFIRMADA' ? `
          <button class="btn btn-success" style="padding: 0 0.75rem; height: 30px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 0.35rem;" onclick="alterarStatusInscricaoPeloCard(${ins.id}, 'CONFIRMADA')">
            ${ICONS.check}
            <span>Confirmar Inscrição</span>
          </button>
        ` : `
          <button class="btn btn-outline" style="padding: 0 0.75rem; height: 30px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 0.35rem;" onclick="alterarStatusInscricaoPeloCard(${ins.id}, 'PENDENTE')">
            ${ICONS.clock}
            <span>Marcar como Pendente</span>
          </button>
        `}
        ${ins.status !== 'CANCELADA' ? `
          <button class="btn btn-danger" style="padding: 0 0.75rem; height: 30px; font-size: 0.75rem; background: #EF4444; border-color: #EF4444; display: inline-flex; align-items: center; gap: 0.35rem;" onclick="alterarStatusInscricaoPeloCard(${ins.id}, 'CANCELADA')">
            ${ICONS.x}
            <span>Cancelar</span>
          </button>
        ` : ''}
      </div>

      <button type="button" class="btn btn-outline" style="padding: 0 0.85rem; height: 30px; font-size: 0.75rem;" onclick="fecharModalInscricaoDetalhes()">
        Fechar
      </button>
    </div>
  `;

  modal.style.display = 'flex';
};

// --- Copiar Ficha Individual com Campos Solicitados ---
window.copiarFichaInscrito = function(id) {
  const ins = cachedInscricoesList.find(i => i.id === id);
  if (!ins) return;

  const user = ins.usuario || {};
  const extras = ins.dados_extras || {};
  const valorTotalFmt = parseFloat(ins.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const camposConfigurados = (eventoAtual && eventoAtual.campos_formulario)
    ? eventoAtual.campos_formulario.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    : [];

  const deveExibir = (k) => {
    return camposConfigurados.includes(k.toLowerCase()) || (extras && extras[k]);
  };

  const linhas = [
    `=== FICHA DE INSCRIÇÃO #${ins.id} - ${eventoAtual?.titulo || 'EVENTO UMP'} ===`,
    `Nome: ${user.nome || 'N/A'}`,
    `E-mail: ${user.email || 'N/A'}`
  ];

  if (deveExibir('cpf') || user.cpf) linhas.push(`CPF: ${formatarCPF(user.cpf || extras.cpf || '') || 'Não informado'}`);
  if (deveExibir('telefone') || user.telefone) linhas.push(`Telefone: ${formatarTelefone(user.telefone || extras.telefone || '') || 'Não informado'}`);
  if (deveExibir('data_nascimento')) linhas.push(`Data Nasc.: ${extras.data_nascimento || 'Não informada'}`);
  if (deveExibir('genero')) linhas.push(`Gênero: ${extras.genero || 'Não informado'}`);
  if (deveExibir('estado_civil')) linhas.push(`Estado Civil: ${extras.estado_civil || 'Não informado'}`);

  const temEcl = ['igreja', 'presbiterio', 'cidade', 'nome_pastor', 'contato_pastor', 'cargo_federacao'].some(deveExibir);
  if (temEcl) {
    linhas.push(`----------------------------------------`);
    if (deveExibir('igreja')) linhas.push(`Igreja: ${extras.igreja || '-'}`);
    if (deveExibir('presbiterio')) linhas.push(`Presbitério: ${extras.presbiterio || '-'}`);
    if (deveExibir('cidade')) linhas.push(`Cidade: ${extras.cidade || '-'}`);
    if (deveExibir('nome_pastor')) linhas.push(`Pastor: ${extras.nome_pastor || '-'}`);
    if (deveExibir('contato_pastor')) linhas.push(`Contato Pastor: ${extras.contato_pastor || '-'}`);
    if (deveExibir('cargo_federacao')) linhas.push(`Cargo na Federação: ${extras.cargo_federacao || '-'}`);
  }

  const temSaude = ['tipo_sanguineo', 'contato_emergencia', 'alergias', 'medicamento_continuo', 'restricao_alimentar'].some(deveExibir);
  if (temSaude) {
    linhas.push(`----------------------------------------`);
    if (deveExibir('tipo_sanguineo')) linhas.push(`Tipo Sanguíneo: ${extras.tipo_sanguineo || '-'}`);
    if (deveExibir('contato_emergencia')) linhas.push(`Emergência: ${extras.contato_emergencia || '-'}`);
    if (deveExibir('alergias')) linhas.push(`Alergias: ${extras.alergias || '-'}`);
    if (deveExibir('medicamento_continuo')) linhas.push(`Medicamento Contínuo: ${extras.medicamento_continuo || '-'}`);
    if (deveExibir('restricao_alimentar')) linhas.push(`Restrição Alimentar: ${extras.restricao_alimentar || '-'}`);
  }

  if (deveExibir('tamanho_camiseta')) linhas.push(`Camiseta: ${extras.tamanho_camiseta || '-'}`);
  if (deveExibir('dias_estadia')) linhas.push(`Dia Chegada: ${extras.dias_estadia || '-'}`);

  linhas.push(`----------------------------------------`);
  linhas.push(`Código Check-in: ${ins.codigo_checkin || 'N/A'}`);
  linhas.push(`Status Check-in: ${ins.checkin_realizado ? 'Checked-in' : 'Ausente'}`);
  linhas.push(`Valor: ${valorTotalFmt} | Forma Pagamento: ${formatarFormaPagamento(ins.forma_pagamento, ins.capture_method)}`);
  linhas.push(`Status da Inscrição: ${ins.status}`);

  window.copiarTextoParaClipboard(linhas.join('\n'), 'Ficha do inscrito');
};

// --- Imprimir Ficha Individual com Campos Solicitados ---
window.imprimirFichaInscrito = function(id) {
  const ins = cachedInscricoesList.find(i => i.id === id);
  if (!ins) return;

  const user = ins.usuario || {};
  const extras = ins.dados_extras || {};
  const valorTotalFmt = parseFloat(ins.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dataCriacaoFmt = formatarDataHora(ins.created_at);
  const dataHoje = new Date().toLocaleString('pt-BR');

  const camposConfigurados = (eventoAtual && eventoAtual.campos_formulario)
    ? eventoAtual.campos_formulario.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    : [];

  const deveExibir = (k) => camposConfigurados.includes(k.toLowerCase()) || (extras && extras[k]);

  let camposPessoaisHTML = `
    <div class="field"><span class="field-label">Nome Completo</span><span class="field-val">${user.nome || '-'}</span></div>
    <div class="field"><span class="field-label">E-mail</span><span class="field-val">${user.email || '-'}</span></div>
  `;
  if (deveExibir('cpf') || user.cpf) camposPessoaisHTML += `<div class="field"><span class="field-label">CPF</span><span class="field-val">${formatarCPF(user.cpf || extras.cpf || '') || '-'}</span></div>`;
  if (deveExibir('telefone') || user.telefone) camposPessoaisHTML += `<div class="field"><span class="field-label">Telefone</span><span class="field-val">${formatarTelefone(user.telefone || extras.telefone || '') || '-'}</span></div>`;
  if (deveExibir('data_nascimento')) camposPessoaisHTML += `<div class="field"><span class="field-label">Nascimento / Idade</span><span class="field-val">${calcularIdadeTexto(extras.data_nascimento || '')}</span></div>`;
  if (deveExibir('genero')) camposPessoaisHTML += `<div class="field"><span class="field-label">Gênero</span><span class="field-val">${extras.genero || '-'}</span></div>`;
  if (deveExibir('estado_civil')) camposPessoaisHTML += `<div class="field"><span class="field-label">Estado Civil</span><span class="field-val">${extras.estado_civil || '-'}</span></div>`;

  const temEcl = ['igreja', 'presbiterio', 'cidade', 'nome_pastor', 'contato_pastor', 'cargo_federacao'].some(deveExibir);
  let secaoEcl = '';
  if (temEcl) {
    let sub = '';
    if (deveExibir('igreja')) sub += `<div class="field"><span class="field-label">Igreja</span><span class="field-val">${extras.igreja || '-'}</span></div>`;
    if (deveExibir('presbiterio')) sub += `<div class="field"><span class="field-label">Presbitério</span><span class="field-val">${extras.presbiterio || '-'}</span></div>`;
    if (deveExibir('cidade')) sub += `<div class="field"><span class="field-label">Cidade</span><span class="field-val">${extras.cidade || '-'}</span></div>`;
    if (deveExibir('nome_pastor')) sub += `<div class="field"><span class="field-label">Pastor</span><span class="field-val">${extras.nome_pastor || '-'}</span></div>`;
    if (deveExibir('contato_pastor')) sub += `<div class="field"><span class="field-label">Contato Pastor</span><span class="field-val">${formatarTelefone(extras.contato_pastor || '') || '-'}</span></div>`;
    if (deveExibir('cargo_federacao')) sub += `<div class="field"><span class="field-label">Cargo Federação</span><span class="field-val">${extras.cargo_federacao || '-'}</span></div>`;
    secaoEcl = `
      <div class="section">
        <div class="section-header">Informações Eclesiásticas</div>
        <div class="section-body">${sub}</div>
      </div>
    `;
  }

  const temSaude = ['tipo_sanguineo', 'contato_emergencia', 'alergias', 'medicamento_continuo', 'restricao_alimentar'].some(deveExibir);
  let secaoSaude = '';
  if (temSaude) {
    let sub = '';
    if (deveExibir('tipo_sanguineo')) sub += `<div class="field"><span class="field-label">Tipo Sanguíneo</span><span class="field-val highlight">${extras.tipo_sanguineo || '-'}</span></div>`;
    if (deveExibir('contato_emergencia')) sub += `<div class="field" style="grid-column: span 2;"><span class="field-label">Emergência</span><span class="field-val highlight">${extras.contato_emergencia || '-'}</span></div>`;
    if (deveExibir('alergias')) sub += `<div class="field" style="grid-column: span 3;"><span class="field-label">Alergias</span><span class="field-val">${extras.alergias || '-'}</span></div>`;
    if (deveExibir('medicamento_continuo')) sub += `<div class="field"><span class="field-label">Medicamento</span><span class="field-val">${extras.medicamento_continuo || '-'}</span></div>`;
    if (deveExibir('restricao_alimentar')) sub += `<div class="field"><span class="field-label">Restrição Alimentar</span><span class="field-val">${extras.restricao_alimentar || '-'}</span></div>`;
    secaoSaude = `
      <div class="section">
        <div class="section-header">Saúde & Emergência</div>
        <div class="section-body">${sub}</div>
      </div>
    `;
  }

  let subLogistica = '';
  if (deveExibir('tamanho_camiseta')) subLogistica += `<div class="field"><span class="field-label">Camiseta</span><span class="field-val">${extras.tamanho_camiseta || '-'}</span></div>`;
  if (deveExibir('dias_estadia')) subLogistica += `<div class="field"><span class="field-label">Dia Chegada</span><span class="field-val">${extras.dias_estadia || '-'}</span></div>`;
  subLogistica += `
    <div class="field"><span class="field-label">Cód. Check-in</span><span class="field-val">${ins.codigo_checkin || '-'}</span></div>
    <div class="field"><span class="field-label">Valor Total</span><span class="field-val">${valorTotalFmt}</span></div>
    <div class="field"><span class="field-label">Forma Pagamento</span><span class="field-val">${formatarFormaPagamento(ins.forma_pagamento, ins.capture_method)}</span></div>
    <div class="field"><span class="field-label">Data da Inscrição</span><span class="field-val">${dataCriacaoFmt}</span></div>
  `;

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Ficha #${ins.id} - ${user.nome || 'UMP'}</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 25px; color: #1e293b; line-height: 1.5; font-size: 13px; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1d4ed8; padding-bottom: 10px; margin-bottom: 16px; }
        .title { font-size: 1.3rem; font-weight: bold; color: #1d4ed8; margin: 0; }
        .subtitle { font-size: 0.85rem; color: #64748b; margin: 2px 0 0 0; }
        .badge { display: inline-block; padding: 3px 8px; font-size: 0.72rem; font-weight: bold; border-radius: 4px; text-transform: uppercase; }
        .badge-success { background: #d1fae5; color: #047857; }
        .badge-warning { background: #fef3c7; color: #b45309; }
        .section { margin-bottom: 14px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
        .section-header { background: #f8fafc; padding: 6px 12px; font-weight: bold; font-size: 0.8rem; color: #1e40af; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; letter-spacing: 0.04em; }
        .section-body { padding: 10px 12px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 0.82rem; }
        .field { display: flex; flex-direction: column; }
        .field-label { font-size: 0.7rem; color: #64748b; font-weight: 600; text-transform: uppercase; }
        .field-val { font-weight: 600; color: #0f172a; margin-top: 1px; }
        .highlight { color: #dc2626; font-weight: bold; }
        .footer { margin-top: 25px; border-top: 1px dashed #cbd5e1; padding-top: 8px; font-size: 0.72rem; color: #64748b; text-align: center; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1 class="title">${eventoAtual?.titulo || 'UMP Eventos'}</h1>
          <p class="subtitle">Ficha Individual do Participante • Inscrição #${ins.id}</p>
        </div>
        <div style="text-align: right;">
          <span class="badge ${ins.status === 'CONFIRMADA' ? 'badge-success' : 'badge-warning'}">${ins.status}</span>
          <div style="font-size: 0.75rem; color: #64748b; margin-top: 4px;">Check-in: ${ins.checkin_realizado ? 'Checked-in' : 'Ausente'}</div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">Dados Pessoais & Contato</div>
        <div class="section-body">${camposPessoaisHTML}</div>
      </div>

      ${secaoEcl}
      ${secaoSaude}

      <div class="section">
        <div class="section-header">Logística & Pagamento</div>
        <div class="section-body">${subLogistica}</div>
      </div>

      <div class="footer">
        Ficha emitida pelo Portal Administrativo UMP Eventos em ${dataHoje}
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 350);
};

window.toggleCheckinPeloCard = async function(inscricaoId) {
  try {
    const res = await API.request(`/admin/eventos/${selectedEventoId}/inscricoes/${inscricaoId}/toggle-checkin`, {
      method: 'POST'
    });
    showToast(res.mensagem, "success");
    await loadInscricoes();
    await loadListaPresenca();
    window.abrirModalInscricaoDetalhes(inscricaoId);
  } catch (err) {
    showToast(err.message || "Erro ao alternar check-in.", "error");
  }
};

window.alterarStatusInscricaoPeloCard = async function(inscricaoId, novoStatus) {
  try {
    await API.request(`/admin/inscricoes/${inscricaoId}/status?novo_status=${novoStatus}`, { method: 'PUT' });
    showToast(`Status alterado para ${novoStatus}!`, 'success');
    await loadInscricoes();
    window.abrirModalInscricaoDetalhes(inscricaoId);
  } catch (err) {
    showToast(err.message || "Erro ao atualizar status.", "error");
  }
};

window.darBaixaParcelaPeloCard = async function(parcelaId, inscricaoId) {
  try {
    await API.request(`/admin/parcelas/${parcelaId}/status?novo_status=PAGO`, { method: 'PUT' });
    showToast('Parcela quitada com sucesso!', 'success');
    await loadPagamentos();
    await loadInscricoes();
    window.abrirModalInscricaoDetalhes(inscricaoId);
  } catch (err) {
    showToast(err.message || "Erro ao quitar parcela.", "error");
  }
};

// --- Carregar Pagamentos ---
let allPagamentosCached = [];

async function loadPagamentos() {
  const container = document.getElementById('pagamentos-table-body');
  if (!container) return;

  try {
    const pagamentos = await API.request(`/admin/pagamentos?evento_id=${selectedEventoId}`);
    allPagamentosCached = pagamentos;

    // Calcular Métricas
    let totalInscricoes = 0;
    let totalRecebido = 0;
    let totalPendente = 0;
    let totalVencido = 0;

    pagamentos.forEach(pag => {
      if (pag.status === 'CANCELADO' || pag.status === 'CANCELADA' || pag.inscricao_status === 'CANCELADA') return;

      const valorTotal = parseFloat(pag.valor);
      totalInscricoes += valorTotal;

      if (pag.forma_pagamento === 'PARCELADO') {
        if (pag.parcelas && pag.parcelas.length > 0) {
          pag.parcelas.forEach(p => {
            const valParc = parseFloat(p.valor);
            if (p.status === 'PAGO') {
              totalRecebido += valParc;
            } else if (p.status === 'PENDENTE') {
              totalPendente += valParc;
            } else if (p.status === 'VENCIDO' || p.status === 'VENCIDA') {
              totalVencido += valParc;
            }
          });
        }
      } else {
        if (pag.status === 'PAGO') {
          totalRecebido += valorTotal;
        } else if (pag.status === 'PENDENTE') {
          totalPendente += valorTotal;
        } else if (pag.status === 'VENCIDO' || pag.status === 'VENCIDA') {
          totalVencido += valorTotal;
        }
      }
    });

    const formatBRL = (val) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('evt-total-inscricoes').textContent = formatBRL(totalInscricoes);
    document.getElementById('evt-total-recebido').textContent = formatBRL(totalRecebido);
    document.getElementById('evt-total-pendente').textContent = formatBRL(totalPendente);
    document.getElementById('evt-total-vencido').textContent = formatBRL(totalVencido);

    currentPagePagamentos = 1;
    updatePagamentosTable();
  } catch (err) {
    container.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-danger);">Erro ao carregar pagamentos.</td></tr>`;
  }
}

window.updatePagamentosTable = function() {
  const container = document.getElementById('pagamentos-table-body');
  if (!container) return;

  const searchVal = document.getElementById('pay-filter-search').value.toLowerCase().trim();
  const methodVal = document.getElementById('pay-filter-method').value;
  const statusVal = document.getElementById('pay-filter-status').value;

  let rows = [];
  allPagamentosCached.forEach(pag => {
    if (methodVal && pag.forma_pagamento !== methodVal) return;

    if (searchVal) {
      const nameMatch = pag.usuario_nome && pag.usuario_nome.toLowerCase().includes(searchVal);
      const emailMatch = pag.usuario_email && pag.usuario_email.toLowerCase().includes(searchVal);
      const cpfMatch = pag.usuario_cpf && pag.usuario_cpf.toLowerCase().includes(searchVal);
      if (!nameMatch && !emailMatch && !cpfMatch) return;
    }

    const userDisplay = pag.usuario_nome ? `<strong>${pag.usuario_nome}</strong><br><small style="color:var(--text-muted);">${pag.usuario_email || ''}</small>` : 'N/A';

    if (pag.parcelas && pag.parcelas.length > 0) {
      pag.parcelas.forEach(parc => {
        if (statusVal && parc.status !== statusVal) return;
        rows.push({
          id: `Pag #${pag.id} (Parc ${parc.numero})`,
          userDisplay,
          inscricaoId: pag.inscricao_id,
          formaPag: formatarFormaPagamento(pag.forma_pagamento, pag.capture_method),
          valor: parseFloat(parc.valor),
          vencimento: new Date(parc.vencimento + (parc.vencimento.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('pt-BR'),
          status: parc.status,
          parcelaId: parc.id,
          isParcela: true
        });
      });
    } else {
      if (statusVal && pag.status !== statusVal) return;
      rows.push({
        id: `Pag #${pag.id}`,
        userDisplay,
        inscricaoId: pag.inscricao_id,
        formaPag: formatarFormaPagamento(pag.forma_pagamento, pag.capture_method),
        valor: parseFloat(pag.valor),
        vencimento: 'N/A',
        status: pag.status,
        isParcela: false
      });
    }
  });

  const totalItems = rows.length;
  const start = (currentPagePagamentos - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const paginatedRows = rows.slice(start, end);

  if (totalItems === 0) {
    container.innerHTML = `<tr><td colspan="8" style="text-align:center;">Nenhum pagamento correspondente aos filtros.</td></tr>`;
    renderPaginationControls('pagamentos-pagination-container', currentPagePagamentos, totalItems, 'changePagePagamentos');
    return;
  }

  const statusBadgeClass = (status) => {
    if (status === 'PAGO') return 'badge-success';
    if (status === 'CANCELADO' || status === 'CANCELADA') return 'badge-info';
    if (status === 'VENCIDO' || status === 'VENCIDA') return 'badge-danger';
    return 'badge-warning';
  };

  container.innerHTML = paginatedRows.map(row => {
    let actionHTML = '-';
    if (row.isParcela) {
      if (row.status === 'PAGO') {
        actionHTML = '<span style="color:#059669; font-weight:600;">Quitada</span>';
      } else if (row.status === 'CANCELADO' || row.status === 'CANCELADA') {
        actionHTML = '<span style="color:#ef4444; font-weight:600;">Cancelada</span>';
      } else {
        actionHTML = `<button class="btn btn-success" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="alterarStatusParcela(${row.parcelaId}, 'PAGO')">Dar Baixa (Pago)</button>`;
      }
    }

    return `
      <tr>
        <td>${row.id}</td>
        <td>${row.userDisplay}</td>
        <td>Inscrição #${row.inscricaoId}</td>
        <td>${row.formaPag}</td>
        <td>R$ ${row.valor.toFixed(2).replace('.', ',')}</td>
        <td>${row.vencimento}</td>
        <td><span class="badge ${statusBadgeClass(row.status)}">${row.status}</span></td>
        <td>${actionHTML}</td>
      </tr>
    `;
  }).join('');

  renderPaginationControls('pagamentos-pagination-container', currentPagePagamentos, totalItems, 'changePagePagamentos');
};

window.changePagePagamentos = function(page) {
  currentPagePagamentos = page;
  updatePagamentosTable();
};

window.filterPagamentosLocal = function() {
  currentPagePagamentos = 1;
  updatePagamentosTable();
};

window.alterarStatusParcela = async function(id, novoStatus) {
  try {
    await API.request(`/admin/parcelas/${id}/status?novo_status=${novoStatus}`, { method: 'PUT' });
    showToast('Status da parcela atualizado!', 'success');
    loadPagamentos();
  } catch (err) {}
};

// --- Salvar Alterações do Evento (Tab 3) ---
window.salvarEvento = async function(e) {
  e.preventDefault();
  const fieldsSelected = Array.from(document.querySelectorAll('.ev-form-field:checked')).map(cb => cb.value).join(',');
  
  const fotosUrlsList = [];
  for (let i = 1; i <= 8; i++) {
    const val = document.getElementById(`ev-foto-${i}`).value.trim();
    if (val) fotosUrlsList.push(val);
  }
  const fotosUrls = fotosUrlsList.join(',');

  const payload = {
    titulo: document.getElementById('ev-titulo').value,
    descricao: document.getElementById('ev-descricao-editor').innerHTML,
    data_inicio: document.getElementById('ev-inicio').value ? (document.getElementById('ev-inicio').value.length === 16 ? document.getElementById('ev-inicio').value + ":00" : document.getElementById('ev-inicio').value) : null,
    data_fim: document.getElementById('ev-fim').value ? (document.getElementById('ev-fim').value.length === 16 ? document.getElementById('ev-fim').value + ":00" : document.getElementById('ev-fim').value) : null,
    local: document.getElementById('ev-local').value,
    valor: parseFloat(document.getElementById('ev-valor').value),
    max_participantes: parseInt(document.getElementById('ev-max-part').value) || null,
    ativo: document.getElementById('ev-ativo').checked,
    campos_formulario: fieldsSelected || null,
    fotos: fotosUrls || null,
    whatsapp_grupo_link: document.getElementById('ev-whatsapp-link').value.trim() || null
  };

  try {
    await API.request(`/admin/eventos/${selectedEventoId}`, { method: 'PUT', body: JSON.stringify(payload) });
    showToast('Evento atualizado com sucesso!', 'success');
    await loadEventoInfo(); // recarregar cabeçalho e formulário
  } catch (err) {
    showToast('Erro ao atualizar evento.', 'error');
  }
};

// --- Excluir Evento (Tab 4) ---
window.excluirEventoAtual = async function() {
  if (confirm(`Tem certeza que deseja excluir permanentemente o evento "${eventoAtual?.titulo}" e todas as suas inscrições?`)) {
    try {
      await API.request(`/admin/eventos/${selectedEventoId}`, { method: 'DELETE' });
      showToast('Evento excluído com sucesso!', 'success');
      setTimeout(() => window.location.href = 'index.html', 1500);
    } catch (err) {
      showToast('Erro ao excluir evento.', 'error');
    }
  }
};

// --- Helpers e Impressão / Exportação ---
function formatarLabelCampo(field) {
  const map = {
    cpf: 'CPF',
    telefone: 'Telefone',
    data_nascimento: 'Nascimento',
    genero: 'Gênero',
    tamanho_camiseta: 'Camiseta',
    tipo_sanguineo: 'Sangue',
    alergias: 'Alergias',
    medicamento_continuo: 'Medicamentos',
    contato_emergencia: 'Emergência',
    restricao_alimentar: 'Alimentação',
    igreja: 'Igreja',
    presbiterio: 'Presbitério',
    cidade: 'Cidade',
    estado_civil: 'Estado Civil',
    nome_pastor: 'Nome Pastor',
    contato_pastor: 'Contato Pastor',
    cargo_federacao: 'Cargo Federação',
    dias_estadia: 'Dia da chegada'
  };
  return map[field] || field.toUpperCase();
}

function formatarFormaPagamento(fp, capture) {
  if (fp === 'INFINITEPAY') {
    return capture === 'pix' ? 'Pix (InfinitePay)' : 'Cartão (InfinitePay)';
  }
  if (fp === 'PIX') {
    return 'Pix Direto';
  }
  if (fp === 'PARCELADO') {
    return 'Parcelado (Carnê)';
  }
  return fp || 'Parcelado (Carnê)';
}

window.exportarCSV = function() {
  if (cachedInscricoesList.length === 0) {
    showToast("Nenhuma inscrição para exportar.", "warning");
    return;
  }

  let customFields = [];
  if (eventoAtual && eventoAtual.campos_formulario) {
    customFields = eventoAtual.campos_formulario.split(',').filter(f => f.trim() !== '');
  }

  let headers = ["ID", "Nome", "E-mail", "Status", "Forma Pagamento", "Valor Total"];
  customFields.forEach(f => {
    headers.push(formatarLabelCampo(f));
  });

  const lines = [headers.join(';')];
  cachedInscricoesList.forEach(ins => {
    const user = ins.usuario || {};
    const row = [
      ins.id,
      user.nome || 'N/A',
      user.email || 'N/A',
      ins.status,
      formatarFormaPagamento(ins.forma_pagamento, ins.capture_method),
      ins.valor_total
    ];
    customFields.forEach(f => {
      row.push((ins.dados_extras && ins.dados_extras[f]) ? ins.dados_extras[f] : '-');
    });
    lines.push(row.join(';'));
  });

  const csvContent = "\uFEFF" + lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `inscricoes_${eventoAtual.titulo.toLowerCase().replace(/\s+/g, '_')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

window.imprimirPDF = function() {
  if (cachedInscricoesList.length === 0) {
    showToast("Nenhuma inscrição para imprimir.", "warning");
    return;
  }

  const printWindow = window.open('', '_blank');
  
  let customFields = [];
  if (eventoAtual && eventoAtual.campos_formulario) {
    customFields = eventoAtual.campos_formulario.split(',').filter(f => f.trim() !== '');
  }

  let html = `
    <html>
      <head>
        <title>Inscrições - ${eventoAtual.titulo}</title>
        <style>
          body { font-family: sans-serif; padding: 20px; color: #333; }
          h2 { margin-bottom: 5px; }
          h4 { margin-top: 0; color: #666; font-weight: normal; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; text-align: left; font-size: 12px; }
          th, td { border: 1px solid #ddd; padding: 8px; }
          th { background-color: #f2f2f2; }
          .badge { display: inline-block; padding: 3px 6px; font-size: 10px; font-weight: bold; border-radius: 4px; text-transform: uppercase; }
          .badge-success { background-color: #D1FAE5; color: #065F46; }
          .badge-warning { background-color: #FEF3C7; color: #92400E; }
          .badge-danger { background-color: #FEE2E2; color: #991B1B; }
        </style>
      </head>
      <body>
        <h2>Lista de Inscrições</h2>
        <h4>Evento: <strong>${eventoAtual.titulo}</strong></h4>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Participante</th>
              <th>Status</th>
  `;

  customFields.forEach(f => {
    html += `<th>${formatarLabelCampo(f)}</th>`;
  });

  html += `
            </tr>
          </thead>
          <tbody>
  `;

  const rowsHtml = cachedInscricoesList.map(ins => {
    const user = ins.usuario || {};
    const statusBadge = ins.status === 'CONFIRMADA' ? 'badge-success' : ins.status === 'PENDENTE' ? 'badge-warning' : 'badge-danger';
    let cols = `
      <td>#${ins.id}</td>
      <td><strong>${user.nome || 'N/A'}</strong><br>${user.email || ''}</td>
      <td><span class="badge ${statusBadge}">${ins.status}</span></td>
    `;
    customFields.forEach(f => {
      const val = (ins.dados_extras && ins.dados_extras[f]) ? ins.dados_extras[f] : '-';
      cols += `<td>${val}</td>`;
    });
    return `<tr>${cols}</tr>`;
  }).join('');

  html += rowsHtml + `
          </tbody>
        </table>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 500);
};

// --- Upload de Foto no Supabase ---
window.uploadImageToField = async function(inputElement, targetFieldId) {
  const file = inputElement.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  const label = inputElement.parentElement;
  const originalText = label.innerHTML;
  
  label.innerHTML = '⏳ ...';
  label.style.pointerEvents = 'none';

  try {
    const res = await API.request('/admin/eventos/upload', {
      method: 'POST',
      body: formData
    });
    
    document.getElementById(targetFieldId).value = res.url;
    
    // Atualizar preview correspondente
    const idx = parseInt(targetFieldId.replace('ev-foto-', ''));
    if (!isNaN(idx)) {
      updateMediaPreview(idx, res.url);
    }
    
    showToast('Arquivo enviado com sucesso para o Supabase Storage!', 'success');
  } catch (err) {
    showToast(err.message || 'Erro ao enviar arquivo.', 'error');
  } finally {
    label.innerHTML = originalText;
    label.style.pointerEvents = 'auto';
    inputElement.value = '';
  }
};

// --- Funções de Pré-visualização de Mídias ---
function isVideoUrl(url) {
  if (!url) return false;
  const cleanUrl = url.split('?')[0].toLowerCase();
  return cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.webm') || cleanUrl.endsWith('.mov') || cleanUrl.endsWith('.avi');
}

window.updateMediaPreview = function(index, url) {
  const container = document.getElementById(`preview-foto-${index}`);
  if (!container) return;

  if (!url) {
    container.innerHTML = 'Sem prévia';
    return;
  }

  if (isVideoUrl(url)) {
    container.innerHTML = `<video src="${url}" controls style="max-height: 100px; max-width: 100%; border-radius: 4px; display: block; margin: 0 auto;"></video>`;
  } else {
    container.innerHTML = `<img src="${url}" style="max-height: 100px; max-width: 100%; border-radius: 4px; object-fit: cover; display: block; margin: 0 auto;" onerror="this.parentElement.innerHTML='Sem prévia (Link inválido)'">`;
  }
};

window.onMediaUrlChange = function(index) {
  const url = document.getElementById(`ev-foto-${index}`).value.trim();
  updateMediaPreview(index, url);
};

// --- Controle de Check-in (Leitor de Câmera & Busca Manual) ---
let html5QrcodeScanner = null;

window.iniciarLeitorCheckin = function() {
  const readerDiv = document.getElementById('reader');
  if (!readerDiv) return;

  readerDiv.innerHTML = "";
  readerDiv.style.border = "none";

  const btnStop = document.getElementById('btn-stop-checkin');
  if (btnStop) btnStop.disabled = false;

  html5QrcodeScanner = new Html5Qrcode("reader");
  const config = { fps: 10, qrbox: { width: 220, height: 220 } };

  html5QrcodeScanner.start(
    { facingMode: "environment" },
    config,
    (decodedText) => {
      // Quando ler com sucesso
      processarQrCodeEscaneado(decodedText);
    },
    (errorMessage) => {
      // Ignora logs de erro contínuos de foco para não sobrecarregar
    }
  ).catch(err => {
    showToast("Erro ao acessar a câmera. Verifique as permissões.", "error");
    readerDiv.innerHTML = "Erro ao carregar câmera";
    readerDiv.style.border = "2px dashed #cbd5e1";
    if (btnStop) btnStop.disabled = true;
  });
};

window.pararLeitorCheckin = function() {
  const btnStop = document.getElementById('btn-stop-checkin');
  if (btnStop) btnStop.disabled = true;

  if (html5QrcodeScanner) {
    html5QrcodeScanner.stop().then(() => {
      html5QrcodeScanner = null;
      const readerDiv = document.getElementById('reader');
      if (readerDiv) {
        readerDiv.innerHTML = "Leitor inativo";
        readerDiv.style.border = "2px dashed #cbd5e1";
      }
    }).catch(err => {
      // Se der erro ao parar (já parado)
      html5QrcodeScanner = null;
    });
  }
};

// --- Fila e Caching de Inscrições para Controle de Presença Local ---
let cacheCheckinParticipantes = [];
let filtroPresencaAtivo = 'todos';
let currentTriagemCode = null;

// Carrega todos os participantes do evento para cálculo das estatísticas
window.loadListaPresenca = async function() {
  try {
    const data = await API.request(`/admin/eventos/${selectedEventoId}/checkin/participantes`);
    // Manter apenas inscrições com status CONFIRMADA
    cacheCheckinParticipantes = (data || []).filter(ins => ins.status === 'CONFIRMADA');
    currentPagePresenca = 1;
    renderCheckinMetrics();
    renderTabelaPresenca();
  } catch (err) {
    console.error("Erro ao carregar lista de presença:", err);
  }
};

function renderCheckinMetrics() {
  const list = cacheCheckinParticipantes;
  const confirmados = list.filter(ins => ins.status === 'CONFIRMADA');
  const totalConfirmados = confirmados.length;
  const presentes = confirmados.filter(ins => ins.checkin_realizado).length;
  const ausentes = totalConfirmados - presentes;
  const taxa = totalConfirmados > 0 ? Math.round((presentes / totalConfirmados) * 100) : 0;

  const countTodos = document.getElementById('count-filtro-todos');
  const countPresentes = document.getElementById('count-filtro-presentes');
  const countAusentes = document.getElementById('count-filtro-ausentes');
  const metricConfirmados = document.getElementById('checkin-metric-confirmados');
  const metricPresentes = document.getElementById('checkin-metric-presentes');
  const metricAusentes = document.getElementById('checkin-metric-ausentes');
  const metricTaxa = document.getElementById('checkin-metric-taxa');

  if (metricConfirmados) metricConfirmados.textContent = totalConfirmados;
  if (metricPresentes) metricPresentes.textContent = presentes;
  if (metricAusentes) metricAusentes.textContent = ausentes;
  if (metricTaxa) metricTaxa.textContent = `${taxa}%`;

  if (countTodos) countTodos.textContent = list.length;
  if (countPresentes) countPresentes.textContent = list.filter(ins => ins.checkin_realizado).length;
  if (countAusentes) countAusentes.textContent = list.filter(ins => !ins.checkin_realizado).length;
}

function renderTabelaPresenca() {
  const tableBody = document.getElementById('presenca-table-body');
  if (!tableBody) return;

  const searchInput = document.getElementById('presenca-table-search');
  const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';

  let list = cacheCheckinParticipantes;

  // Filtrar pela aba selecionada
  if (filtroPresencaAtivo === 'presentes') {
    list = list.filter(ins => ins.checkin_realizado);
  } else if (filtroPresencaAtivo === 'ausentes') {
    list = list.filter(ins => !ins.checkin_realizado);
  }

  // Filtrar pela busca de texto local
  if (searchQuery) {
    list = list.filter(ins => 
      ins.nome.toLowerCase().includes(searchQuery) || 
      (ins.cpf && ins.cpf.includes(searchQuery)) || 
      ins.email.toLowerCase().includes(searchQuery)
    );
  }

  const totalItems = list.length;
  const start = (currentPagePresenca - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const paginatedList = list.slice(start, end);

  if (paginatedList.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">Nenhum participante correspondente encontrado.</td></tr>`;
    renderPaginationControls('presenca-pagination-container', currentPagePresenca, totalItems, 'changePagePresenca');
    return;
  }

  tableBody.innerHTML = paginatedList.map(ins => {
    let badgeClass = 'badge-warning';
    if (ins.status === 'CONFIRMADA') badgeClass = 'badge-success';
    else if (ins.status === 'CANCELADA' || ins.status === 'CANCELADO') badgeClass = 'badge-danger';

    const checkinStatusHTML = ins.checkin_realizado ? 
      `<div style="color: #10B981; font-weight: 600; display: inline-flex; align-items: center; gap: 0.3rem;">
         ${ICONS.checkCircle}
         <span>Presente</span>
       </div>
       <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: normal; margin-top: 2px;">
         ${ins.checkin_data ? new Date(ins.checkin_data).toLocaleString('pt-BR') : ''}
       </div>` : 
      `<span style="color: #F59E0B; font-weight: 600; display: inline-flex; align-items: center; gap: 0.3rem;">${ICONS.clock} <span>Ausente</span></span>`;

    const btnText = ins.checkin_realizado ? "Desfazer Check-in" : "Confirmar Check-in";
    const btnClass = ins.checkin_realizado ? "btn btn-outline" : "btn btn-primary";

    return `
      <tr style="border-bottom: 1px solid var(--border-color); vertical-align: middle;">
        <td style="padding: 0.75rem;">
          <strong style="color: var(--text-dark); display: block;">${ins.nome}</strong>
          <span style="font-size: 0.75rem; color: var(--text-muted);">${ins.email}</span>
        </td>
        <td style="padding: 0.75rem;">${ins.cpf || 'N/A'}</td>
        <td style="padding: 0.75rem;"><span class="badge ${badgeClass}">${ins.status}</span></td>
        <td style="padding: 0.75rem;">${checkinStatusHTML}</td>
        <td style="padding: 0.75rem; text-align: center;">
          <button class="${btnClass}" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="realizarCheckinManual(${ins.inscricao_id})">
            ${btnText}
          </button>
        </td>
      </tr>
    `;
  }).join('');

  renderPaginationControls('presenca-pagination-container', currentPagePresenca, totalItems, 'changePagePresenca');
}

window.changePagePresenca = function(page) {
  currentPagePresenca = page;
  renderTabelaPresenca();
};

window.setPresencaFiltro = function(filtro) {
  filtroPresencaAtivo = filtro;
  currentPagePresenca = 1;

  // Toggle active tab classes
  const tabs = ['todos', 'presentes', 'ausentes'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-presenca-${t}`);
    if (btn) {
      if (t === filtro) {
        btn.style.background = 'var(--primary)';
        btn.style.color = 'white';
        btn.style.borderColor = 'var(--primary)';
      } else {
        btn.style.background = 'transparent';
        btn.style.color = 'var(--text-muted)';
        btn.style.borderColor = 'var(--border-color)';
      }
    }
  });

  renderTabelaPresenca();
};

window.filtrarTabelaPresenca = function() {
  currentPagePresenca = 1;
  renderTabelaPresenca();
};

async function processarQrCodeEscaneado(codigo) {
  const alertDiv = document.getElementById('checkin-feedback-alert');
  if (alertDiv) {
    alertDiv.style.display = 'none';
  }

  // Pausar scanner
  if (html5QrcodeScanner) {
    html5QrcodeScanner.pause(true);
  }

  try {
    const res = await API.request(`/admin/eventos/${selectedEventoId}/checkin/detalhes?codigo_checkin=${encodeURIComponent(codigo)}`);
    
    // Preencher Ficha de Triagem
    currentTriagemCode = codigo;
    document.getElementById('triagem-nome').textContent = res.nome;
    document.getElementById('triagem-cpf').textContent = res.cpf || 'Não informado';
    document.getElementById('triagem-email').textContent = res.email;
    
    const badge = document.getElementById('triagem-status-badge');
    if (badge) {
      badge.textContent = res.status;
      badge.className = 'badge';
      if (res.status === 'CONFIRMADA') badge.classList.add('badge-success');
      else if (res.status === 'CANCELADA' || res.status === 'CANCELADO') badge.classList.add('badge-danger');
      else badge.classList.add('badge-warning');
    }

    const confirmBtn = document.getElementById('btn-triagem-confirmar');
    const avisoContainer = document.getElementById('triagem-aviso-container');
    const avisoTexto = document.getElementById('triagem-aviso-texto');

    if (res.status !== 'CONFIRMADA') {
      if (avisoContainer && avisoTexto) {
        avisoContainer.style.display = 'flex';
        avisoContainer.style.background = '#fee2e2';
        avisoContainer.style.borderColor = '#fca5a5';
        avisoContainer.style.color = '#b91c1c';
        avisoTexto.textContent = `Aviso: Inscrição está no status '${res.status}'. Certifique o pagamento!`;
      }
      if (confirmBtn) {
        confirmBtn.innerHTML = `${ICONS.alertTriangle} <span>Confirmar Mesmo Assim</span>`;
        confirmBtn.className = 'btn btn-danger';
        confirmBtn.style.background = '#EF4444';
        confirmBtn.style.borderColor = '#EF4444';
        confirmBtn.style.display = 'inline-flex';
        confirmBtn.style.alignItems = 'center';
        confirmBtn.style.justifyContent = 'center';
        confirmBtn.style.gap = '0.4rem';
      }
    } else if (res.checkin_realizado) {
      if (avisoContainer && avisoTexto) {
        avisoContainer.style.display = 'flex';
        avisoContainer.style.background = '#fef3c7';
        avisoContainer.style.borderColor = '#fcd34d';
        avisoContainer.style.color = '#92400e';
        const horaStr = res.checkin_data ? new Date(res.checkin_data).toLocaleString('pt-BR') : '';
        avisoTexto.textContent = `Aviso: Check-in já realizado anteriormente em ${horaStr}!`;
      }
      if (confirmBtn) {
        confirmBtn.innerHTML = `${ICONS.undo} <span>Confirmar Novamente</span>`;
        confirmBtn.className = 'btn btn-primary';
        confirmBtn.style.background = 'var(--primary)';
        confirmBtn.style.borderColor = 'var(--primary)';
        confirmBtn.style.display = 'inline-flex';
        confirmBtn.style.alignItems = 'center';
        confirmBtn.style.justifyContent = 'center';
        confirmBtn.style.gap = '0.4rem';
      }
    } else {
      if (avisoContainer) avisoContainer.style.display = 'none';
      if (confirmBtn) {
        confirmBtn.innerHTML = `${ICONS.check} <span>Confirmar Entrada</span>`;
        confirmBtn.className = 'btn btn-success';
        confirmBtn.style.background = '#10B981';
        confirmBtn.style.borderColor = '#10B981';
        confirmBtn.style.display = 'inline-flex';
        confirmBtn.style.alignItems = 'center';
        confirmBtn.style.justifyContent = 'center';
        confirmBtn.style.gap = '0.4rem';
      }
    }

    // Exibir Ficha de Triagem
    document.getElementById('checkin-scanned-card').style.display = 'flex';
  } catch (err) {
    showToast(err.message || 'Código de QR Code inválido ou não cadastrado.', 'error');
    // Retomar scanner se deu erro na leitura
    if (html5QrcodeScanner) {
      html5QrcodeScanner.resume();
    }
  }
}

window.confirmarCheckinTriagem = async function() {
  if (!currentTriagemCode) return;

  const confirmBtn = document.getElementById('btn-triagem-confirmar');
  const origText = confirmBtn ? confirmBtn.textContent : '';
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span class="spinner"></span> Confirmando...';
  }

  try {
    const res = await API.request(`/admin/eventos/${selectedEventoId}/checkin`, {
      method: 'POST',
      body: JSON.stringify({ codigo_checkin: currentTriagemCode })
    });

    showToast(res.mensagem, res.sucesso ? "success" : "warning");
    
    // Fechar Ficha de Triagem e recarregar dados da lista
    cancelarTriagem();
    await loadListaPresenca();
  } catch (err) {
    showToast(err.message || "Erro ao realizar check-in.", "error");
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = origText;
    }
  }
};

window.cancelarTriagem = function() {
  currentTriagemCode = null;
  document.getElementById('checkin-scanned-card').style.display = 'none';
  // Retomar scanner
  if (html5QrcodeScanner) {
    html5QrcodeScanner.resume();
  }
};

window.buscarParticipantesCheckin = async function() {
  const searchInput = document.getElementById('checkin-search-input');
  const resultsList = document.getElementById('checkin-results-list');
  if (!searchInput || !resultsList) return;

  const query = searchInput.value.trim();
  if (query.length < 2) {
    resultsList.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem; text-align: center; margin-top: 3rem;">Digite pelo menos 2 caracteres para pesquisar.</p>`;
    return;
  }

  try {
    const list = await API.request(`/admin/eventos/${selectedEventoId}/checkin/participantes?search=${encodeURIComponent(query)}`);
    if (!list || list.length === 0) {
      resultsList.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem; text-align: center; margin-top: 3rem;">Nenhum participante encontrado.</p>`;
      return;
    }

    resultsList.innerHTML = list.map(ins => {
      let badgeClass = 'badge-warning';
      if (ins.status === 'CONFIRMADA') badgeClass = 'badge-success';
      else if (ins.status === 'CANCELADA' || ins.status === 'CANCELADO') badgeClass = 'badge-danger';

      const checkinBadge = ins.checkin_realizado ? 
        `<span class="badge badge-success">Checked-in</span>` : 
        `<span class="badge badge-warning">Ausente</span>`;

      const checkinBtnText = ins.checkin_realizado ? "Desfazer Check-in" : "Check-in Manual";
      const checkinBtnClass = ins.checkin_realizado ? "btn btn-outline" : "btn btn-primary";

      return `
        <div style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid var(--border-color); padding: 0.75rem 1rem; border-radius: var(--radius-md); margin-bottom: 0.5rem; gap: 0.5rem;">
          <div>
            <div style="font-weight: 700; font-size: 0.9rem;">${ins.nome}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">CPF: ${ins.cpf || 'N/A'} | Email: ${ins.email}</div>
            <div style="display: flex; gap: 0.35rem; margin-top: 0.25rem;">
              <span class="badge ${badgeClass}">${ins.status}</span>
              ${checkinBadge}
            </div>
          </div>
          <div>
            <button class="${checkinBtnClass}" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;" onclick="realizarCheckinManual(${ins.inscricao_id})">
              ${checkinBtnText}
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    resultsList.innerHTML = `<p style="color: #b91c1c; font-size: 0.9rem; text-align: center; margin-top: 2rem;">Erro ao carregar participantes.</p>`;
  }
};

window.realizarCheckinManual = async function(inscricaoId) {
  try {
    const res = await API.request(`/admin/eventos/${selectedEventoId}/inscricoes/${inscricaoId}/toggle-checkin`, {
      method: 'POST'
    });
    showToast(res.mensagem, "success");
    await loadListaPresenca();
    buscarParticipantesCheckin();
  } catch (err) {
    showToast(err.message || "Erro ao atualizar check-in manual.", "error");
  }
};
