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

window.logoutAdmin = function() {
  API.removeToken();
  window.location.href = 'index.html';
};

function isUsuarioAdminGlobal(user) {
  if (!user || !user.is_admin) return false;
  const perfil = String(user.perfil_acesso || 'global').toLowerCase().trim();
  const permissoes = perfil.split(',').map(p => p.trim()).filter(Boolean);
  return perfil === 'global' || permissoes.includes('global');
}

function aplicarRestricoesPerfilNoEvento(user) {
  if (!user || !user.is_admin) return false;
  const perfil = String(user.perfil_acesso || 'global').toLowerCase().trim();
  const permissoes = perfil.split(',').map(p => p.trim()).filter(Boolean);
  const isGlobal = isUsuarioAdminGlobal(user);

  document.body.classList.remove(
    'perfil-admin-global',
    'perfil-admin-gincana',
    'perfil-admin-cantina',
    'perfil-admin-secretaria'
  );
  document.body.classList.add(`perfil-admin-${perfil}`);

  const temEventos = isGlobal || permissoes.includes('eventos') || permissoes.includes('secretaria');
  if (!temEventos) {
    if (permissoes.includes('gincana')) {
      window.location.replace('gincana.html');
    } else if (permissoes.includes('cantina')) {
      window.location.replace('cantina.html');
    } else {
      window.location.replace('index.html');
    }
    return false;
  }

  // Ocultar itens da sidebar não permitidos
  document.querySelectorAll('.sidebar-menu li').forEach(li => {
    const aba = li.getAttribute('data-aba');
    if (!aba) return;
    let permitido = isGlobal;
    if (aba === 'eventos') permitido = temEventos;
    else if (aba === 'gincana') permitido = isGlobal || permissoes.includes('gincana');
    else if (aba === 'cantina') permitido = isGlobal || permissoes.includes('cantina');
    else if (aba === 'configuracoes') permitido = isGlobal || permissoes.includes('configuracoes');

    if (!permitido) {
      li.style.setProperty('display', 'none', 'important');
    } else {
      li.style.removeProperty('display');
    }
  });

  // Ocultar abas restritas no gerenciar-evento para perfil secretaria (deixar apenas check-in)
  ['dashboard', 'inscricoes', 'diarias', 'acomodacao', 'pagamentos', 'editar', 'excluir'].forEach(abaRestrita => {
    const btnTab = document.getElementById(`tab-btn-${abaRestrita}`);
    const paneTab = document.getElementById(`pane-${abaRestrita}`);
    if (!isGlobal) {
      if (btnTab) {
        btnTab.classList.remove('active');
        btnTab.style.setProperty('display', 'none', 'important');
      }
      if (paneTab) {
        paneTab.classList.remove('active');
        paneTab.style.setProperty('display', 'none', 'important');
      }
    } else {
      if (btnTab) btnTab.style.removeProperty('display');
      if (paneTab) paneTab.style.removeProperty('display');
    }
  });

  if (!isGlobal) {
    const btnCheckin = document.getElementById('tab-btn-checkin');
    const paneCheckin = document.getElementById('pane-checkin');
    if (btnCheckin) btnCheckin.classList.add('active');
    if (paneCheckin) paneCheckin.classList.add('active');
  }

  // Exibir badge do perfil na sidebar
  const brandSub = document.querySelector('.sidebar-brand');
  if (brandSub && !isGlobal) {
    let badge = document.getElementById('badge-perfil-sidebar');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'badge-perfil-sidebar';
      brandSub.appendChild(badge);
    }
    badge.style.cssText = 'font-size: 0.68rem; color: #F59E0B; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.2rem; display: block;';
    badge.textContent = `Acesso: ${perfil.toUpperCase()}`;
  }

  return true;
}

document.addEventListener('DOMContentLoaded', async () => {
  const token = API.getToken();
  let user = API.getUser();
  if (!token || !user || !user.is_admin) {
    window.location.href = 'index.html';
    return;
  }

  if (!aplicarRestricoesPerfilNoEvento(user)) return;

  try {
    const me = await API.request('/auth/me');
    if (me && me.is_admin) {
      API.setUser(me);
      user = me;
      if (!aplicarRestricoesPerfilNoEvento(user)) return;
    }
  } catch (err) {
    console.warn('Não foi possível sincronizar perfil do usuário:', err);
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
  if (isUsuarioAdminGlobal(user)) {
    await loadInscricoes();
    await carregarIgrejasFiltro();
    await carregarDiaristas();
    await loadPagamentos();
  }
  await loadListaPresenca();

  // Inicializar aba inicial conforme perfil
  if (!isUsuarioAdminGlobal(user)) {
    const btnCheckin = document.getElementById('tab-btn-checkin');
    switchSubTab('pane-checkin', btnCheckin);
  } else {
    const initialTab = urlParams.get('tab');
    if (initialTab) {
      const targetBtn = document.getElementById(`tab-btn-${initialTab}`);
      if (targetBtn) {
        switchSubTab(`pane-${initialTab}`, targetBtn);
      }
    } else {
      // Tab ativa por padrão no HTML para Admin Global: Dashboard
      carregarDashboardEvento();
    }
  }
});

// --- Tabs Switcher ---
window.switchSubTab = function(tabId, btn) {
  const user = API.getUser();
  if (!isUsuarioAdminGlobal(user) && tabId !== 'pane-checkin') {
    return;
  }
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  
  const targetPane = document.getElementById(tabId);
  if (targetPane) targetPane.classList.add('active');
  if (btn) btn.classList.add('active');

  // Parar scanner de QR Code caso saia da aba de check-in
  if (tabId !== 'pane-checkin') {
    pararLeitorCheckin();
  }

  // Se ativou a aba do Dashboard, carregar e redimensionar gráficos
  if (tabId === 'pane-dashboard') {
    carregarDashboardEvento();
  }
  if (tabId === 'pane-acomodacao') {
    carregarAcomodacoesEvento();
  }
};

// --- Carregar Detalhes do Evento ---
async function loadEventoInfo() {
  try {
    try {
      eventoAtual = await API.request(`/admin/eventos/${selectedEventoId}`);
    } catch (_) {
      eventoAtual = await API.request(`/eventos/publico/${selectedEventoId}`);
    }
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
    const cbEncerradas = document.getElementById('ev-inscricoes-encerradas');
    if (cbEncerradas) {
      cbEncerradas.checked = Boolean(eventoAtual.inscricoes_encerradas);
    }
    atualizarBadgeStatusEdicao();
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

    // Inicializar UI de configurações de diárias
    if (typeof renderConfigDiariasUI === 'function') {
      renderConfigDiariasUI();
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

// --- Carregar Lista de Igrejas para o Datalist do Filtro (Apenas igrejas presentes nas inscrições) ---
window.carregarIgrejasFiltro = async function() {
  const datalist = document.getElementById('datalist-igrejas');
  if (!datalist || !selectedEventoId) return;

  try {
    let listaIgrejas = [];
    try {
      const resEvento = await API.request(`/admin/eventos/${selectedEventoId}/igrejas`);
      if (Array.isArray(resEvento)) {
        listaIgrejas = [...resEvento];
      }
    } catch (e) {
      console.warn("Não foi possível carregar igrejas do evento via API:", e);
    }

    // Complementar com as igrejas presentes nas inscrições já em memória
    if (Array.isArray(cachedInscricoesList)) {
      cachedInscricoesList.forEach(ins => {
        const extras = ins.dados_extras || {};
        const ig = extras.igreja || extras.dyn_igreja || extras.Igreja;
        if (ig && typeof ig === 'string' && ig.trim()) {
          const nome = ig.trim();
          if (!listaIgrejas.some(item => item.toLowerCase() === nome.toLowerCase())) {
            listaIgrejas.push(nome);
          }
        }
      });
    }

    const sorted = Array.from(new Set(listaIgrejas)).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    datalist.innerHTML = sorted.map(ig => `<option value="${ig}"></option>`).join('');
  } catch (err) {
    console.error("Erro ao carregar lista de igrejas para sugestões:", err);
  }
};

let debounceTimerIgreja = null;
window.onInputIgrejaFiltro = function() {
  const input = document.getElementById('filter-igreja');
  const btnClear = document.getElementById('btn-clear-igreja-filtro');
  if (btnClear) {
    btnClear.style.display = input && input.value ? 'block' : 'none';
  }
  clearTimeout(debounceTimerIgreja);
  debounceTimerIgreja = setTimeout(() => {
    loadInscricoes();
  }, 250);
};

window.limparFiltroIgrejaInput = function() {
  const input = document.getElementById('filter-igreja');
  const btnClear = document.getElementById('btn-clear-igreja-filtro');
  if (input) input.value = '';
  if (btnClear) btnClear.style.display = 'none';
  loadInscricoes();
};

// --- Carregar Inscrições ---
window.loadInscricoes = async function() {
  const status = document.getElementById('filter-status')?.value || '';
  const search = document.getElementById('filter-search')?.value || '';
  const igreja = document.getElementById('filter-igreja')?.value?.trim() || '';

  let queryStr = `?page=1&limit=500&evento_id=${selectedEventoId}`;
  if (status) queryStr += `&status_filtro=${status}`;
  if (search) queryStr += `&search=${encodeURIComponent(search)}`;
  if (igreja) queryStr += `&igreja=${encodeURIComponent(igreja)}`;

  atualizarBotaoLimparFiltros();

  try {
    const data = await API.request(`/admin/inscricoes${queryStr}`);
    cachedInscricoesList = data;
    currentPageInscricoes = 1;
    renderInscricoesTable();

    // Se o datalist estiver vazio e não houver filtro de igreja ativo, atualizar sugestões a partir das inscrições
    const datalist = document.getElementById('datalist-igrejas');
    if (datalist && datalist.children.length === 0 && !igreja && Array.isArray(data) && data.length > 0) {
      carregarIgrejasFiltro();
    }
  } catch (err) {
    const container = document.getElementById('inscricoes-table-body');
    if (container) {
      container.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-danger);">Erro ao carregar inscrições.</td></tr>`;
    }
  }
};

// --- Limpar Filtros das Inscrições ---
window.limparFiltrosInscricoes = function() {
  const fSearch = document.getElementById('filter-search');
  const fStatus = document.getElementById('filter-status');
  const fIgreja = document.getElementById('filter-igreja');
  const btnClearIgreja = document.getElementById('btn-clear-igreja-filtro');
  if (fSearch) fSearch.value = '';
  if (fStatus) fStatus.value = '';
  if (fIgreja) fIgreja.value = '';
  if (btnClearIgreja) btnClearIgreja.style.display = 'none';
  loadInscricoes();
};

function atualizarBotaoLimparFiltros() {
  const fSearch = document.getElementById('filter-search')?.value || '';
  const fStatus = document.getElementById('filter-status')?.value || '';
  const fIgreja = document.getElementById('filter-igreja')?.value?.trim() || '';
  const btnLimpar = document.getElementById('btn-limpar-filtros-inscricoes');
  if (btnLimpar) {
    btnLimpar.style.display = (fSearch || fStatus || fIgreja) ? 'inline-flex' : 'none';
  }
}

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
    if (typeof carregarDashboardEvento === 'function') {
      carregarDashboardEvento();
    }
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

function getFilteredPagamentosRows() {
  const searchInput = document.getElementById('pay-filter-search');
  const methodSelect = document.getElementById('pay-filter-method');
  const statusSelect = document.getElementById('pay-filter-status');

  const searchVal = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const methodVal = methodSelect ? methodSelect.value : '';
  const statusVal = statusSelect ? statusSelect.value : '';

  let rows = [];
  allPagamentosCached.forEach(pag => {
    if (methodVal && pag.forma_pagamento !== methodVal) return;

    if (searchVal) {
      const nameMatch = pag.usuario_nome && pag.usuario_nome.toLowerCase().includes(searchVal);
      const emailMatch = pag.usuario_email && pag.usuario_email.toLowerCase().includes(searchVal);
      const cpfMatch = pag.usuario_cpf && pag.usuario_cpf.toLowerCase().includes(searchVal);
      const inscMatch = String(pag.inscricao_id || '').includes(searchVal);
      const pagIdMatch = String(pag.id || '').includes(searchVal);
      if (!nameMatch && !emailMatch && !cpfMatch && !inscMatch && !pagIdMatch) return;
    }

    const nome = pag.usuario_nome || 'N/A';
    const cpf = pag.usuario_cpf || '';
    const email = pag.usuario_email || '';
    const userDisplay = pag.usuario_nome ? `<strong>${pag.usuario_nome}</strong><br><small style="color:var(--text-muted);">${pag.usuario_email || ''}</small>` : 'N/A';
    const formaPag = formatarFormaPagamento(pag.forma_pagamento, pag.capture_method);

    if (pag.parcelas && pag.parcelas.length > 0) {
      pag.parcelas.forEach(parc => {
        if (statusVal && parc.status !== statusVal) return;
        const dtVenc = parc.vencimento ? new Date(parc.vencimento + (parc.vencimento.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('pt-BR') : 'N/A';
        rows.push({
          id: `Pag #${pag.id} (${parc.numero}/${pag.parcelas.length})`,
          pagamentoId: pag.id,
          parcelaNumero: parc.numero,
          totalParcelas: pag.parcelas.length,
          parcelaTexto: `${parc.numero}/${pag.parcelas.length}`,
          nome,
          cpf,
          email,
          userDisplay,
          inscricaoId: pag.inscricao_id,
          formaPag,
          valor: parseFloat(parc.valor || 0),
          vencimento: dtVenc,
          status: parc.status,
          parcelaId: parc.id,
          isParcela: true
        });
      });
    } else {
      if (statusVal && pag.status !== statusVal) return;
      rows.push({
        id: `Pag #${pag.id}`,
        pagamentoId: pag.id,
        parcelaNumero: 1,
        totalParcelas: 1,
        parcelaTexto: 'Única',
        nome,
        cpf,
        email,
        userDisplay,
        inscricaoId: pag.inscricao_id,
        formaPag,
        valor: parseFloat(pag.valor || 0),
        vencimento: 'N/A',
        status: pag.status,
        isParcela: false
      });
    }
  });

  return rows;
}

window.updatePagamentosTable = function() {
  const container = document.getElementById('pagamentos-table-body');
  if (!container) return;

  const rows = getFilteredPagamentosRows();
  const totalItems = rows.length;

  // Atualizar visibilidade do botão Limpar Filtros
  const searchVal = document.getElementById('pay-filter-search')?.value.trim() || '';
  const methodVal = document.getElementById('pay-filter-method')?.value || '';
  const statusVal = document.getElementById('pay-filter-status')?.value || '';
  const btnLimpar = document.getElementById('btn-limpar-filtros-pagamentos');
  if (btnLimpar) {
    btnLimpar.style.display = (searchVal || methodVal || statusVal) ? 'inline-flex' : 'none';
  }

  // Atualizar contador e total filtrado na barra de cabeçalho
  const countEl = document.getElementById('pay-count-showing');
  const totalFiltEl = document.getElementById('pay-total-filtered');
  if (countEl) countEl.textContent = totalItems;
  if (totalFiltEl) {
    const somaValor = rows.reduce((acc, r) => acc + r.valor, 0);
    totalFiltEl.textContent = somaValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  const start = (currentPagePagamentos - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const paginatedRows = rows.slice(start, end);

  if (totalItems === 0) {
    container.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 2rem; color: var(--text-muted);">Nenhum pagamento correspondente aos filtros.</td></tr>`;
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

window.limparFiltrosPagamentos = function() {
  const searchInput = document.getElementById('pay-filter-search');
  const methodSelect = document.getElementById('pay-filter-method');
  const statusSelect = document.getElementById('pay-filter-status');
  if (searchInput) searchInput.value = '';
  if (methodSelect) methodSelect.value = '';
  if (statusSelect) statusSelect.value = '';
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

// --- Exportar Lista de Pagamentos para Excel (CSV compatível) ---
window.exportarPagamentosExcel = function() {
  const rows = getFilteredPagamentosRows();
  if (!rows || rows.length === 0) {
    showToast("Nenhum pagamento correspondente aos filtros para exportar.", "warning");
    return;
  }

  const nomeEvento = (eventoAtual && eventoAtual.titulo) ? eventoAtual.titulo : `Evento_${selectedEventoId}`;
  
  const headers = [
    "Cód. Lançamento",
    "Inscrição",
    "Participante",
    "CPF",
    "E-mail",
    "Forma de Pagamento",
    "Parcela",
    "Valor (R$)",
    "Vencimento",
    "Status"
  ];

  const escapeCSV = (str) => `"${String(str || '').replace(/"/g, '""')}"`;

  const lines = [headers.map(escapeCSV).join(';')];

  rows.forEach(r => {
    lines.push([
      escapeCSV(r.id),
      escapeCSV(`#${r.inscricaoId}`),
      escapeCSV(r.nome),
      escapeCSV(r.cpf),
      escapeCSV(r.email),
      escapeCSV(r.formaPag),
      escapeCSV(r.parcelaTexto),
      escapeCSV(r.valor.toFixed(2).replace('.', ',')),
      escapeCSV(r.vencimento),
      escapeCSV(r.status)
    ].join(';'));
  });

  const csvContent = "\uFEFF" + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const dataHoje = new Date().toISOString().slice(0, 10);
  link.setAttribute("href", url);
  link.setAttribute("download", `pagamentos_${nomeEvento.toLowerCase().replace(/\s+/g, '_')}_${dataHoje}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast(`Exportação concluída! ${rows.length} lançamentos exportados.`, "success");
};

// --- Imprimir Relatório Otimizado de Pagamentos (Alta densidade para caber vários em 1 folha) ---
window.imprimirPagamentos = function() {
  const rows = getFilteredPagamentosRows();
  if (!rows || rows.length === 0) {
    showToast("Nenhum pagamento correspondente aos filtros para imprimir.", "warning");
    return;
  }

  const nomeEvento = (eventoAtual && eventoAtual.titulo) ? eventoAtual.titulo : `Evento #${selectedEventoId}`;
  
  // Filtros aplicados
  const searchVal = document.getElementById('pay-filter-search')?.value.trim() || '';
  const methodVal = document.getElementById('pay-filter-method')?.value || '';
  const statusVal = document.getElementById('pay-filter-status')?.value || '';

  let filtrosDesc = [];
  if (searchVal) filtrosDesc.push(`Busca: "${searchVal}"`);
  if (methodVal) filtrosDesc.push(`Forma: ${methodVal}`);
  if (statusVal) filtrosDesc.push(`Status: ${statusVal}`);
  const filtrosTexto = filtrosDesc.length > 0 ? filtrosDesc.join(' &bull; ') : 'Todos os lançamentos';

  // Métricas do conjunto filtrado
  let totalSoma = 0;
  let totalPago = 0;
  let totalPendente = 0;
  let totalVencido = 0;

  rows.forEach(r => {
    totalSoma += r.valor;
    if (r.status === 'PAGO') totalPago += r.valor;
    else if (r.status === 'VENCIDO' || r.status === 'VENCIDA') totalVencido += r.valor;
    else if (r.status === 'PENDENTE') totalPendente += r.valor;
  });

  const fmtMoeda = (val) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dataEmissao = new Date().toLocaleString('pt-BR');

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    showToast("Permita popups no navegador para abrir a impressão.", "error");
    return;
  }

  const tableRowsHtml = rows.map((r, idx) => {
    let badgeClass = 'badge-pendente';
    if (r.status === 'PAGO') badgeClass = 'badge-pago';
    else if (r.status === 'VENCIDO' || r.status === 'VENCIDA') badgeClass = 'badge-vencido';
    else if (r.status === 'CANCELADO' || r.status === 'CANCELADA') badgeClass = 'badge-cancelado';

    const cpfInfo = r.cpf ? `<span style="color:#6B7280; font-size:7pt; margin-left:4px;">(${r.cpf})</span>` : '';

    return `
      <tr>
        <td class="text-center" style="width: 25px; color:#6B7280;">${idx + 1}</td>
        <td style="width: 105px; font-weight:600;">${r.id}</td>
        <td class="text-center" style="width: 50px;">#${r.inscricaoId}</td>
        <td>
          <span style="font-weight:600;">${r.nome}</span>${cpfInfo}
        </td>
        <td style="width: 120px;">${r.formaPag}</td>
        <td class="text-center" style="width: 45px;">${r.parcelaTexto}</td>
        <td class="text-center" style="width: 70px;">${r.vencimento}</td>
        <td class="text-right" style="width: 75px; font-weight:700;">${fmtMoeda(r.valor)}</td>
        <td class="text-center" style="width: 65px;">
          <span class="badge-pill ${badgeClass}">${r.status}</span>
        </td>
      </tr>
    `;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>Relatório de Pagamentos - ${nomeEvento}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 6mm 7mm 6mm 7mm;
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #111827;
          background: #f8fafc;
          padding: 12px;
          font-size: 8pt;
          line-height: 1.15;
        }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; padding: 0 !important; }
        }
        .action-bar {
          background: #1E293B;
          color: #fff;
          padding: 8px 14px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          border-radius: 6px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .action-bar button {
          cursor: pointer;
          padding: 6px 14px;
          font-weight: 700;
          border-radius: 4px;
          border: none;
          font-size: 11px;
        }
        .btn-print { background: #10B981; color: white; }
        .btn-close { background: #475569; color: white; margin-left: 8px; }
        .header-box {
          border-bottom: 1.5pt solid #1F2937;
          padding-bottom: 4px;
          margin-bottom: 5px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }
        .header-title h1 {
          font-size: 11pt;
          font-weight: 800;
          color: #111827;
          letter-spacing: -0.2px;
          text-transform: uppercase;
          line-height: 1.1;
        }
        .header-title h2 {
          font-size: 9pt;
          color: #4F46E5;
          font-weight: 700;
          line-height: 1.2;
        }
        .header-meta {
          font-size: 7pt;
          color: #4B5563;
          text-align: right;
          line-height: 1.3;
        }
        .metrics-strip {
          display: flex;
          gap: 12px;
          background: #F3F4F6;
          border: 0.5pt solid #E5E7EB;
          border-radius: 4px;
          padding: 3px 8px;
          margin-bottom: 5px;
          font-size: 7.5pt;
          align-items: center;
          flex-wrap: wrap;
        }
        .metrics-strip span strong {
          color: #111827;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 7.5pt;
          line-height: 1.15;
        }
        thead {
          display: table-header-group;
        }
        tr {
          page-break-inside: avoid;
        }
        th {
          background-color: #1F2937 !important;
          color: #FFFFFF !important;
          font-size: 7pt;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          padding: 3px 4px;
          border: 0.5pt solid #1F2937;
          text-align: left;
        }
        td {
          padding: 2.2px 4px;
          border: 0.5pt solid #E5E7EB;
          vertical-align: middle;
        }
        tr:nth-child(even) td {
          background-color: #F9FAFB !important;
        }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .badge-pill {
          display: inline-block;
          padding: 1px 4px;
          font-size: 6.5pt;
          font-weight: 700;
          border-radius: 3px;
          text-align: center;
          line-height: 1.1;
          text-transform: uppercase;
        }
        .badge-pago {
          color: #065F46;
          background: #D1FAE5 !important;
          border: 0.5pt solid #A7F3D0;
        }
        .badge-pendente {
          color: #92400E;
          background: #FEF3C7 !important;
          border: 0.5pt solid #FDE68A;
        }
        .badge-vencido {
          color: #991B1B;
          background: #FEE2E2 !important;
          border: 0.5pt solid #FECACA;
        }
        .badge-cancelado {
          color: #374151;
          background: #F3F4F6 !important;
          border: 0.5pt solid #E5E7EB;
        }
        tfoot td {
          font-weight: 700;
          background: #F3F4F6 !important;
          border-top: 1pt solid #1F2937;
          padding: 3.5px 4px;
        }
        .footer-note {
          margin-top: 6px;
          font-size: 6.5pt;
          color: #9CA3AF;
          display: flex;
          justify-content: space-between;
        }
      </style>
    </head>
    <body>
      <div class="action-bar no-print">
        <div style="font-size: 11px;">
          <strong>Visualização de Impressão</strong> &bull; ${rows.length} lançamentos &bull; Otimizado para alta densidade (A4)
        </div>
        <div>
          <button class="btn-print" onclick="window.print()">🖨️ Imprimir Agora</button>
          <button class="btn-close" onclick="window.close()">✕ Fechar</button>
        </div>
      </div>

      <div class="header-box">
        <div class="header-title">
          <h1>Relatório Financeiro de Pagamentos</h1>
          <h2>${nomeEvento}</h2>
        </div>
        <div class="header-meta">
          <div><strong>Emissão:</strong> ${dataEmissao}</div>
          <div><strong>Filtro:</strong> ${filtrosTexto}</div>
        </div>
      </div>

      <div class="metrics-strip">
        <span>Lançamentos: <strong>${rows.length}</strong></span>
        <span>&bull;</span>
        <span>Total: <strong>${fmtMoeda(totalSoma)}</strong></span>
        <span>&bull;</span>
        <span style="color:#047857;">Recebido (Pago): <strong>${fmtMoeda(totalPago)}</strong></span>
        <span>&bull;</span>
        <span style="color:#B45309;">Pendente: <strong>${fmtMoeda(totalPendente)}</strong></span>
        ${totalVencido > 0 ? `<span>&bull;</span><span style="color:#B91C1C;">Vencido: <strong>${fmtMoeda(totalVencido)}</strong></span>` : ''}
      </div>

      <table>
        <thead>
          <tr>
            <th class="text-center">#</th>
            <th>Cód. / Parcela</th>
            <th class="text-center">Insc.</th>
            <th>Participante (CPF)</th>
            <th>Forma Pagamento</th>
            <th class="text-center">Parc.</th>
            <th class="text-center">Vencimento</th>
            <th class="text-right">Valor</th>
            <th class="text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="7" class="text-right">TOTAL GERAL FILTRADO:</td>
            <td class="text-right">${fmtMoeda(totalSoma)}</td>
            <td class="text-center">${rows.length} reg.</td>
          </tr>
        </tfoot>
      </table>

      <div class="footer-note">
        <span>Plataforma Sinodal PB &bull; UMP Inscrições e Eventos</span>
        <span>Documento gerado para controle administrativo interno</span>
      </div>

      <script>
        window.addEventListener('load', () => {
          setTimeout(() => {
            window.focus();
            window.print();
          }, 350);
        });
      </script>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
};

// --- Atualizar Badges de Status do Evento na Aba Editar e Cabeçalho ---
window.atualizarBadgeStatusEdicao = function() {
  const ativo = document.getElementById('ev-ativo')?.checked !== false;
  const encerradas = Boolean(document.getElementById('ev-inscricoes-encerradas')?.checked);
  const diariasHabilitadas = Boolean(eventoAtual?.diarias_habilitadas);

  const badgeIconLock = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: -2px;"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
  const badgeIconCheck = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: -2px;"><polyline points="20 6 9 17 4 12"/></svg>`;
  const badgeIconCalendar = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: -2px;"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;

  let statusBadgeHTML = '';
  if (!ativo) {
    statusBadgeHTML = `<span class="badge badge-danger" style="display: inline-flex; align-items: center; font-size: 0.8rem; padding: 0.4rem 0.85rem;">${badgeIconLock}Evento Inativo</span>`;
  } else if (encerradas) {
    statusBadgeHTML = `<span class="badge" style="display: inline-flex; align-items: center; background: #FEE2E2; color: #991B1B; border: 1px solid #FCA5A5; font-size: 0.8rem; font-weight: 700; padding: 0.4rem 0.85rem;">${badgeIconLock}Inscrições Encerradas</span>`;
  } else {
    statusBadgeHTML = `<span class="badge" style="display: inline-flex; align-items: center; background: #DEF7EC; color: #03543F; border: 1px solid #A7F3D0; font-size: 0.8rem; font-weight: 700; padding: 0.4rem 0.85rem;">${badgeIconCheck}Inscrições Abertas</span>`;
  }

  const editStatusContainer = document.getElementById('edit-inscricoes-status-badge');
  if (editStatusContainer) editStatusContainer.innerHTML = statusBadgeHTML;

  const editPreview = document.getElementById('edit-inscricoes-badge-preview');
  if (editPreview) editPreview.innerHTML = statusBadgeHTML;

  const headerBadges = document.getElementById('event-detail-badges');
  if (headerBadges) {
    const diariaBadge = diariasHabilitadas
      ? `<span class="badge" style="display: inline-flex; align-items: center; background: #FAF5FF; color: #7E22CE; border: 1px solid #E9D5FF; font-size: 0.8rem; font-weight: 700; padding: 0.4rem 0.85rem;">${badgeIconCalendar}Diárias Abertas</span>`
      : '';
    headerBadges.innerHTML = `${statusBadgeHTML}${diariaBadge}`;
  }
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
    inscricoes_encerradas: Boolean(document.getElementById('ev-inscricoes-encerradas')?.checked),
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
  const filtroIgreja = document.getElementById('filter-igreja')?.value || '';
  const igrejaSuffix = filtroIgreja ? `_${filtroIgreja.toLowerCase().replace(/\s+/g, '_')}` : '';
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `inscricoes_${eventoAtual.titulo.toLowerCase().replace(/\s+/g, '_')}${igrejaSuffix}.csv`);
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

  const filtroIgreja = document.getElementById('filter-igreja')?.value || '';
  const filtroStatus = document.getElementById('filter-status')?.value || '';
  let subInfo = `Evento: <strong>${eventoAtual.titulo}</strong>`;
  if (filtroIgreja) subInfo += ` &bull; Igreja: <strong>${filtroIgreja}</strong>`;
  if (filtroStatus) subInfo += ` &bull; Status: <strong>${filtroStatus}</strong>`;

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
        <h4>${subInfo}</h4>
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
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">Nenhum participante correspondente encontrado.</td></tr>`;
    renderPaginationControls('presenca-pagination-container', currentPagePresenca, totalItems, 'changePagePresenca');
    return;
  }

  tableBody.innerHTML = paginatedList.map(ins => {
    let badgeClass = 'badge-warning';
    if (ins.status === 'CONFIRMADA') badgeClass = 'badge-success';
    else if (ins.status === 'CANCELADA' || ins.status === 'CANCELADO') badgeClass = 'badge-danger';

    const tipoBadge = ins.tipo === 'DIARIA'
      ? `<span class="badge" style="background: #EDE9FE; color: #6D28D9; font-size: 0.72rem; padding: 2px 6px;">Diária (${ins.dias_formatados || 'Dias'})</span>`
      : `<span class="badge" style="background: #EFF6FF; color: #1D4ED8; font-size: 0.72rem; padding: 2px 6px;">Integral</span>`;

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

    const acomodacaoCell = ins.acomodacao_nome
      ? `<span class="badge" style="background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE; font-weight: 600;">${escAc(ins.acomodacao_nome)}</span>`
      : `<span style="color: var(--text-muted); font-size: 0.78rem;">Não definida</span>`;

    return `
      <tr style="border-bottom: 1px solid var(--border-color); vertical-align: middle;">
        <td style="padding: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
            <strong style="color: var(--text-dark);">${ins.nome}</strong>
            ${tipoBadge}
          </div>
          <span style="font-size: 0.75rem; color: var(--text-muted);">${ins.email}</span>
        </td>
        <td style="padding: 0.75rem;">${ins.cpf || 'N/A'}</td>
        <td style="padding: 0.75rem;">${acomodacaoCell}</td>
        <td style="padding: 0.75rem;"><span class="badge ${badgeClass}">${ins.status}</span></td>
        <td style="padding: 0.75rem;">${checkinStatusHTML}</td>
        <td style="padding: 0.75rem; text-align: center;">
          <button class="${btnClass}" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="realizarCheckinManual(${ins.inscricao_id}, '${ins.tipo || 'REGULAR'}')">
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

    // Atualizar badge de tipo (Integral vs Diária)
    const tipoBadge = document.getElementById('triagem-tipo-badge');
    const diariaDiasContainer = document.getElementById('triagem-diaria-dias-container');
    if (tipoBadge) {
      if (res.tipo === 'DIARIA') {
        tipoBadge.textContent = 'Diária';
        tipoBadge.style.background = '#EDE9FE';
        tipoBadge.style.color = '#6D28D9';
      } else {
        tipoBadge.textContent = 'Integral';
        tipoBadge.style.background = '#EFF6FF';
        tipoBadge.style.color = '#1D4ED8';
      }
    }

    if (diariaDiasContainer) {
      if (res.tipo === 'DIARIA') {
        diariaDiasContainer.style.display = 'block';
        const diasStr = res.dias_formatados || (Array.isArray(res.dias_selecionados) ? res.dias_selecionados.join(', ') : res.dias_selecionados);
        diariaDiasContainer.innerHTML = `
          <div>📅 <strong>Dias Contratados:</strong> ${diasStr}</div>
          <div style="margin-top: 4px; font-size: 0.75rem;">
            ${res.valido_hoje ? '<span style="color: #059669; font-weight: bold;">✅ Autorizado para a data de hoje!</span>' : '<span style="color: #DC2626; font-weight: bold;">⚠️ ATENÇÃO: Diária para outra data!</span>'}
          </div>
        `;
      } else {
        diariaDiasContainer.style.display = 'none';
      }
    }
    
    const acTriagemContainer = document.getElementById('triagem-acomodacao-container');
    if (acTriagemContainer) {
      acTriagemContainer.style.display = 'flex';
      acTriagemContainer.style.alignItems = 'center';
      acTriagemContainer.style.gap = '0.5rem';
      if (res.acomodacao_nome) {
        acTriagemContainer.style.background = '#ECFDF5';
        acTriagemContainer.style.border = '1px solid #A7F3D0';
        acTriagemContainer.style.color = '#065F46';
        const tipoInfo = res.acomodacao_tipo ? ` (${escAc(res.acomodacao_tipo)})` : '';
        acTriagemContainer.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg><span>Acomodação: <strong>${escAc(res.acomodacao_nome)}</strong>${tipoInfo}</span>`;
      } else {
        acTriagemContainer.style.background = '#F8FAFC';
        acTriagemContainer.style.border = '1px solid #E2E8F0';
        acTriagemContainer.style.color = '#64748B';
        acTriagemContainer.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg><span>Acomodação: Não definida pela organização</span>`;
      }
    }

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
    
    cancelarTriagem();
    await loadListaPresenca();
    await carregarDiaristas();
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

      const tipoBadge = ins.tipo === 'DIARIA'
        ? `<span class="badge" style="background: #EDE9FE; color: #6D28D9; font-size: 0.7rem;">Diária (${ins.dias_formatados || 'Dias'})</span>`
        : `<span class="badge" style="background: #EFF6FF; color: #1D4ED8; font-size: 0.7rem;">Integral</span>`;

      const checkinBadge = ins.checkin_realizado ? 
        `<span class="badge badge-success">Checked-in</span>` : 
        `<span class="badge badge-warning">Ausente</span>`;

      const checkinBtnText = ins.checkin_realizado ? "Desfazer Check-in" : "Check-in Manual";
      const checkinBtnClass = ins.checkin_realizado ? "btn btn-outline" : "btn btn-primary";

      return `
        <div style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid var(--border-color); padding: 0.75rem 1rem; border-radius: var(--radius-md); margin-bottom: 0.5rem; gap: 0.5rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.4rem;">
              <span style="font-weight: 700; font-size: 0.9rem;">${ins.nome}</span>
              ${tipoBadge}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">CPF: ${ins.cpf || 'N/A'} | Email: ${ins.email}</div>
            <div style="display: flex; gap: 0.35rem; margin-top: 0.25rem;">
              <span class="badge ${badgeClass}">${ins.status}</span>
              ${checkinBadge}
            </div>
          </div>
          <div>
            <button class="${checkinBtnClass}" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;" onclick="realizarCheckinManual(${ins.inscricao_id}, '${ins.tipo || 'REGULAR'}')">
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

window.realizarCheckinManual = async function(inscricaoId, tipo = 'REGULAR') {
  try {
    const res = await API.request(`/admin/eventos/${selectedEventoId}/inscricoes/${inscricaoId}/toggle-checkin?tipo=${tipo}`, {
      method: 'POST'
    });
    showToast(res.mensagem, "success");
    await loadListaPresenca();
    buscarParticipantesCheckin();
    if (typeof carregarDashboardEvento === 'function') {
      carregarDashboardEvento();
    }
    if (tipo === 'DIARIA') {
      await carregarDiaristas();
    }
  } catch (err) {
    showToast(err.message || "Erro ao atualizar check-in manual.", "error");
  }
};

// ==========================================
// --- MÓDULO DE GESTÃO DE DIÁRIAS DO EVENTO ---
// ==========================================

let cachedDiaristasList = [];

function gerarDiasDoEvento(dataInicioStr, dataFimStr) {
  const dias = [];
  if (!dataInicioStr || !dataFimStr) return dias;
  const dtInicio = new Date(dataInicioStr);
  const dtFim = new Date(dataFimStr);

  const cur = new Date(dtInicio.getFullYear(), dtInicio.getMonth(), dtInicio.getDate());
  const fim = new Date(dtFim.getFullYear(), dtFim.getMonth(), dtFim.getDate());

  const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

  while (cur <= fim) {
    const yyyy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, '0');
    const dd = String(cur.getDate()).padStart(2, '0');
    const isoDate = `${yyyy}-${mm}-${dd}`;
    const diaNome = diasSemana[cur.getDay()];
    const label = `${diaNome} (${dd}/${mm})`;

    dias.push({ data: isoDate, label: label });
    cur.setDate(cur.getDate() + 1);
  }
  return dias;
}

window.renderConfigDiariasUI = function() {
  if (!eventoAtual) return;

  const toggle = document.getElementById('diarias-toggle-habilitado');
  const valorPadraoInput = document.getElementById('diaria-valor-padrao');
  const badgeContainer = document.getElementById('diarias-status-badge-container');
  const tableBody = document.getElementById('diarias-dias-table-body');
  const diaFilterSelect = document.getElementById('diarias-filter-dia');

  const habilitado = Boolean(eventoAtual.diarias_habilitadas);
  if (toggle) toggle.checked = habilitado;

  if (badgeContainer) {
    badgeContainer.innerHTML = habilitado
      ? `<span class="badge" style="background: #DEF7EC; color: #03543F; font-size: 0.85rem; padding: 0.4rem 0.8rem;">Diárias Habilitadas</span>`
      : `<span class="badge" style="background: #F1F5F9; color: #64748B; font-size: 0.85rem; padding: 0.4rem 0.8rem;">Diárias Desabilitadas</span>`;
  }

  const config = eventoAtual.config_diarias || {};
  const valorPadrao = config.valor_padrao !== undefined ? config.valor_padrao : '';
  if (valorPadraoInput) valorPadraoInput.value = valorPadrao;

  const observacaoInput = document.getElementById('diaria-observacao');
  const observacao = config.observacao !== undefined ? config.observacao : (config.descricao || '');
  if (observacaoInput) observacaoInput.value = observacao;

  // Gerar dias do evento
  const diasGerados = gerarDiasDoEvento(eventoAtual.data_inicio, eventoAtual.data_fim);
  const diasSalvos = config.dias || [];

  if (tableBody) {
    if (diasGerados.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 1.5rem; color: var(--text-muted);">Defina as datas de início e término na aba 'Editar Evento' para listar os dias.</td></tr>`;
    } else {
      tableBody.innerHTML = diasGerados.map((d) => {
        const salvo = diasSalvos.find(s => s.data === d.data);
        const ativo = salvo ? (salvo.ativo !== false) : true;
        const valor = salvo && salvo.valor !== undefined ? salvo.valor : (valorPadrao || '');

        return `
          <tr class="diaria-dia-row" data-data="${d.data}" data-label="${d.label}" style="border-bottom: 1px solid var(--border-color); vertical-align: middle;">
            <td style="padding: 0.65rem 1rem; text-align: center;">
              <input type="checkbox" class="diaria-dia-check" ${ativo ? 'checked' : ''} style="width: 17px; height: 17px; cursor: pointer;">
            </td>
            <td style="padding: 0.65rem 1rem; font-weight: 600; color: var(--text-dark);">
              ${d.label}
              <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: normal;">Data ISO: ${d.data}</div>
            </td>
            <td style="padding: 0.65rem 1rem;">
              <div style="display: flex; align-items: center; gap: 0.35rem;">
                <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">R$</span>
                <input type="number" class="form-control diaria-dia-valor" step="0.01" min="0" placeholder="0.00" value="${valor}" style="height: 34px; font-size: 0.85rem; width: 130px;">
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  // Preencher filtro por dia na tabela de diaristas
  if (diaFilterSelect) {
    const curVal = diaFilterSelect.value;
    diaFilterSelect.innerHTML = `<option value="">Todos os Dias</option>` + diasGerados.map(d => `
      <option value="${d.data}" ${curVal === d.data ? 'selected' : ''}>${d.label}</option>
    `).join('');
  }

  // Marcar checkboxes dos campos extras do formulário de diária
  const camposDiariaStr = eventoAtual.campos_formulario_diaria || '';
  const camposDiariaArr = camposDiariaStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  document.querySelectorAll('.diaria-form-field').forEach(cb => {
    cb.checked = camposDiariaArr.includes(cb.value.toLowerCase());
  });
};

window.onToggleDiariasChange = function() {
  const toggle = document.getElementById('diarias-toggle-habilitado');
  const badgeContainer = document.getElementById('diarias-status-badge-container');
  if (!toggle || !badgeContainer) return;

  if (toggle.checked) {
    badgeContainer.innerHTML = `<span class="badge" style="background: #DEF7EC; color: #03543F; font-size: 0.85rem; padding: 0.4rem 0.8rem;">Diárias Habilitadas (Não Salvo)</span>`;
  } else {
    badgeContainer.innerHTML = `<span class="badge" style="background: #FEE2E2; color: #991B1B; font-size: 0.85rem; padding: 0.4rem 0.8rem;">Diárias Desabilitadas (Não Salvo)</span>`;
  }
};

window.aplicarValorPadraoDiarias = function() {
  const padrao = document.getElementById('diaria-valor-padrao')?.value;
  if (!padrao || isNaN(parseFloat(padrao))) {
    showToast('Informe um valor padrão válido para aplicar.', 'warning');
    return;
  }
  const valFmt = parseFloat(padrao).toFixed(2);
  document.querySelectorAll('.diaria-dia-valor').forEach(input => {
    input.value = valFmt;
  });
  showToast(`Valor de R$ ${valFmt.replace('.', ',')} aplicado a todos os dias!`, 'success');
};

window.salvarConfiguracoesDiarias = async function() {
  if (!selectedEventoId) return;

  const habilitado = document.getElementById('diarias-toggle-habilitado').checked;
  const valorPadrao = parseFloat(document.getElementById('diaria-valor-padrao').value) || 0;
  const observacao = document.getElementById('diaria-observacao')?.value.trim() || '';

  const diasRows = document.querySelectorAll('.diaria-dia-row');
  const diasConfig = [];
  diasRows.forEach(row => {
    const dataIso = row.dataset.data;
    const label = row.dataset.label;
    const ativo = row.querySelector('.diaria-dia-check').checked;
    const valor = parseFloat(row.querySelector('.diaria-dia-valor').value) || valorPadrao;
    diasConfig.push({ data: dataIso, label, ativo, valor });
  });

  const camposSelecionados = Array.from(document.querySelectorAll('.diaria-form-field:checked')).map(cb => cb.value).join(',');

  const payload = {
    diarias_habilitadas: habilitado,
    config_diarias: {
      valor_padrao: valorPadrao,
      observacao: observacao,
      dias: diasConfig
    },
    campos_formulario_diaria: camposSelecionados || null
  };

  try {
    await API.request(`/admin/eventos/${selectedEventoId}/diarias-config`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    showToast('Configurações de diárias salvas com sucesso!', 'success');
    await loadEventoInfo();
  } catch (err) {
    showToast(err.message || 'Erro ao salvar configurações de diárias.', 'error');
  }
};

window.carregarDiaristas = async function() {
  const tableBody = document.getElementById('diarias-table-body');
  if (!tableBody || !selectedEventoId) return;

  const search = document.getElementById('diarias-filter-search')?.value || '';
  const dia = document.getElementById('diarias-filter-dia')?.value || '';
  const status = document.getElementById('diarias-filter-status')?.value || '';

  let query = `?evento_id=${selectedEventoId}`;
  if (search) query += `&search=${encodeURIComponent(search)}`;
  if (dia) query += `&dia=${encodeURIComponent(dia)}`;
  if (status) query += `&status=${encodeURIComponent(status)}`;

  try {
    const list = await API.request(`/admin/eventos/${selectedEventoId}/diarias${query}`);
    cachedDiaristasList = list || [];

    const totalBadge = document.getElementById('diarias-total-badge');
    if (totalBadge) totalBadge.textContent = cachedDiaristasList.length;

    renderTabelaDiaristas();
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #EF4444; padding: 2rem;">Erro ao carregar lista de diaristas.</td></tr>`;
  }
};

function renderTabelaDiaristas() {
  const tableBody = document.getElementById('diarias-table-body');
  if (!tableBody) return;

  if (cachedDiaristasList.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">Nenhum diarista encontrado com os filtros selecionados.</td></tr>`;
    return;
  }

  tableBody.innerHTML = cachedDiaristasList.map(dia => {
    const user = dia.usuario || {};
    const extras = dia.dados_extras || {};
    const tel = user.telefone || extras.telefone || '';
    const telLimpo = tel.replace(/\D/g, '');
    const waLink = telLimpo ? `https://wa.me/55${telLimpo}?text=Ol%C3%A1%20${encodeURIComponent(user.nome || '')},%20tudo%20bem?%20Falamos%20da%20organiza%C3%A7%C3%A3o%20do%20evento%20${encodeURIComponent(eventoAtual?.titulo || 'UMP')}!` : null;

    const diasArr = Array.isArray(dia.dias_selecionados) ? dia.dias_selecionados : [dia.dias_selecionados];
    const diasBadges = diasArr.map(d => `<span class="badge" style="background: #F3E8FF; color: #6B21A8; font-size: 0.75rem; margin-right: 3px;">${d}</span>`).join(' ');

    const valorFmt = parseFloat(dia.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const statusBadge = dia.status === 'CONFIRMADA'
      ? `<span class="badge badge-success">Confirmada</span>`
      : `<span class="badge badge-danger">${dia.status}</span>`;

    const checkinBadge = dia.checkin_realizado
      ? `<span class="badge badge-success" style="font-size: 0.75rem;">Checked-in</span>`
      : `<span class="badge" style="background: #F1F5F9; color: var(--text-muted); border: 1px solid #E2E8F0; font-size: 0.75rem;">Ausente</span>`;

    const checkinBtnText = dia.checkin_realizado ? "Desfazer Check-in" : "Check-in Manual";
    const checkinBtnClass = dia.checkin_realizado ? "btn btn-outline" : "btn btn-primary";

    return `
      <tr style="border-bottom: 1px solid var(--border-color); vertical-align: middle;">
        <td style="padding: 0.75rem 1rem;">
          <strong style="color: var(--text-dark); display: block; font-size: 0.9rem;">${user.nome || 'Participante'}</strong>
          <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">CPF: ${formatarCPF(user.cpf || extras.cpf || '')}</span>
          ${waLink ? `<a href="${waLink}" target="_blank" style="font-size: 0.75rem; color: #10B981; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 3px; margin-top: 2px;">${ICONS.whatsapp} ${tel}</a>` : `<span style="font-size: 0.75rem; color: var(--text-muted);">${tel || 'Sem telefone'}</span>`}
        </td>
        <td style="padding: 0.75rem 1rem;">
          ${diasBadges}
          <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">${dia.quantidade_dias} dia(s)</div>
        </td>
        <td style="padding: 0.75rem 1rem; font-weight: 700; color: #6D28D9;">
          ${valorFmt}
        </td>
        <td style="padding: 0.75rem 1rem;">
          ${statusBadge}
        </td>
        <td style="padding: 0.75rem 1rem;">
          ${checkinBadge}
        </td>
        <td style="padding: 0.75rem 1rem; text-align: center;">
          <div style="display: flex; gap: 0.35rem; justify-content: center; align-items: center; flex-wrap: wrap;">
            <button class="btn btn-outline" style="padding: 0.35rem 0.6rem; font-size: 0.75rem;" onclick="abrirModalFichaDiaria(${dia.id})" title="Ver Ficha Completa">
              Ver Ficha
            </button>
            <button class="${checkinBtnClass}" style="padding: 0.35rem 0.6rem; font-size: 0.75rem;" onclick="toggleCheckinDiaria(${dia.id})">
              ${checkinBtnText}
            </button>
            ${dia.status === 'CONFIRMADA' ? `
              <button class="btn btn-outline" style="padding: 0.35rem 0.5rem; font-size: 0.75rem; color: #EF4444;" onclick="alterarStatusDiaria(${dia.id}, 'CANCELADA')" title="Cancelar Diária">
                Cancelar
              </button>
            ` : `
              <button class="btn btn-outline" style="padding: 0.35rem 0.5rem; font-size: 0.75rem; color: #10B981;" onclick="alterarStatusDiaria(${dia.id}, 'CONFIRMADA')" title="Reativar Diária">
                Reativar
              </button>
            `}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.abrirModalFichaDiaria = function(diariaId) {
  const dia = cachedDiaristasList.find(d => d.id === diariaId);
  if (!dia) return;

  const user = dia.usuario || {};
  const extras = dia.dados_extras || {};
  const modal = document.getElementById('modal-detalhes-diaria');
  const conteudo = document.getElementById('modal-detalhes-diaria-conteudo');
  if (!modal || !conteudo) return;

  const tel = user.telefone || extras.telefone || '';
  const telLimpo = tel.replace(/\D/g, '');
  const waLink = telLimpo ? `https://wa.me/55${telLimpo}?text=Ol%C3%A1%20${encodeURIComponent(user.nome || '')},%20falamos%20da%20organiza%C3%A7%C3%A3o%20do%20evento!` : null;

  const diasArr = Array.isArray(dia.dias_selecionados) ? dia.dias_selecionados : [dia.dias_selecionados];
  const diasHTML = diasArr.map(d => `<span style="background: #EDE9FE; color: #6D28D9; font-weight: 700; padding: 4px 10px; border-radius: 6px; font-size: 0.85rem; display: inline-block; margin-right: 5px;">📅 ${d}</span>`).join('');

  const rotulosAmigaveis = {
    cpf: "CPF",
    telefone: "Telefone / WhatsApp",
    data_nascimento: "Data de Nascimento",
    genero: "Gênero",
    tamanho_camiseta: "Tamanho da Camiseta",
    tipo_sanguineo: "Tipo Sanguíneo",
    alergias: "Alergias",
    medicamento_continuo: "Medicamento Contínuo",
    contato_emergencia: "Contato de Emergência",
    restricao_alimentar: "Restrição Alimentar",
    igreja: "Igreja / Congregação",
    presbiterio: "Presbitério",
    cidade: "Cidade",
    estado_civil: "Estado Civil",
    nome_pastor: "Nome do Pastor",
    contato_pastor: "Contato do Pastor",
    cargo_federacao: "Cargo na Federação"
  };

  const extrasRows = Object.keys(rotulosAmigaveis).map(campo => {
    const val = extras[campo];
    if (val === undefined || val === null || String(val).trim() === '') return '';
    return `
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.5rem 0.75rem;">
        <span style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; display: block;">${rotulosAmigaveis[campo]}</span>
        <strong style="font-size: 0.9rem; color: var(--text-dark);">${val}</strong>
      </div>
    `;
  }).filter(Boolean).join('');

  conteudo.innerHTML = `
    <div style="border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1.25rem; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <span class="badge" style="background: #EDE9FE; color: #6D28D9; font-weight: 700; margin-bottom: 0.25rem;">🎫 Inscrição por Diária</span>
        <h3 style="font-size: 1.3rem; font-weight: 800; color: var(--text-dark); margin: 0;">${user.nome || 'Participante'}</h3>
        <span style="font-size: 0.8rem; color: var(--text-muted);">${user.email}</span>
      </div>
      <button onclick="document.getElementById('modal-detalhes-diaria').classList.remove('active')" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>
    </div>

    <!-- Dias Contratados -->
    <div style="background: #FAF5FF; border: 1.5px dashed #C084FC; border-radius: var(--radius-md); padding: 0.85rem 1rem; margin-bottom: 1.25rem;">
      <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: #7E22CE; display: block; margin-bottom: 0.35rem;">Dias Contratados (${dia.quantidade_dias} dia(s)):</span>
      <div style="display: flex; flex-wrap: wrap; gap: 0.35rem;">
        ${diasHTML}
      </div>
    </div>

    <!-- Detalhes do Pagamento & Check-in -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; margin-bottom: 1.25rem;">
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.5rem 0.75rem;">
        <span style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; display: block;">Valor Total Pago</span>
        <strong style="font-size: 1.1rem; color: #6D28D9;">${parseFloat(dia.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.5rem 0.75rem;">
        <span style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; display: block;">Código de Check-in</span>
        <strong style="font-size: 0.95rem; font-family: monospace; color: var(--primary);">${dia.codigo_checkin || 'N/A'}</strong>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.5rem 0.75rem;">
        <span style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; display: block;">Status do Check-in</span>
        <strong style="font-size: 0.9rem; color: ${dia.checkin_realizado ? '#10B981' : '#F59E0B'};">${dia.checkin_realizado ? 'Presente' : 'Ausente'}</strong>
      </div>
    </div>

    <!-- Dados Extras Preenchidos -->
    ${extrasRows ? `
      <div style="margin-bottom: 1.25rem;">
        <h4 style="font-size: 0.9rem; font-weight: 700; color: var(--text-dark); margin-bottom: 0.5rem;">Informações da Inscrição de Diária:</h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.5rem;">
          ${extrasRows}
        </div>
      </div>
    ` : ''}

    <div style="border-top: 1px solid var(--border-color); padding-top: 1rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
      ${waLink ? `
        <a href="${waLink}" target="_blank" class="btn btn-outline" style="color: #10B981; border-color: #10B981; display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.85rem;">
          ${ICONS.whatsapp} Conversar no WhatsApp
        </a>
      ` : '<div></div>'}
      
      <div style="display: flex; gap: 0.5rem;">
        <button class="btn btn-primary" onclick="toggleCheckinDiaria(${dia.id}); document.getElementById('modal-detalhes-diaria').classList.remove('active');" style="font-size: 0.85rem;">
          ${dia.checkin_realizado ? 'Desfazer Check-in' : 'Confirmar Check-in'}
        </button>
        <button class="btn btn-outline" onclick="document.getElementById('modal-detalhes-diaria').classList.remove('active')" style="font-size: 0.85rem;">
          Fechar
        </button>
      </div>
    </div>
  `;

  modal.classList.add('active');
};

window.fecharModalDiariaBackdrop = function(e) {
  if (e.target.id === 'modal-detalhes-diaria') {
    e.target.classList.remove('active');
  }
};

window.toggleCheckinDiaria = async function(diariaId) {
  try {
    const res = await API.request(`/admin/eventos/${selectedEventoId}/inscricoes/${diariaId}/toggle-checkin?tipo=DIARIA`, {
      method: 'POST'
    });
    showToast(res.mensagem, "success");
    await carregarDiaristas();
    await loadListaPresenca();
  } catch (err) {
    showToast(err.message || "Erro ao alternar check-in.", "error");
  }
};

window.alterarStatusDiaria = async function(diariaId, novoStatus) {
  if (!confirm(`Deseja alterar o status da diária para ${novoStatus}?`)) return;
  try {
    await API.request(`/admin/eventos/${selectedEventoId}/diarias/${diariaId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: novoStatus })
    });
    showToast(`Status da diária atualizado para ${novoStatus}!`, "success");
    await carregarDiaristas();
    await loadListaPresenca();
  } catch (err) {
    showToast(err.message || "Erro ao atualizar status da diária.", "error");
  }
};

window.exportarDiaristasExcel = function() {
  if (cachedDiaristasList.length === 0) {
    showToast('Nenhum diarista para exportar.', 'warning');
    return;
  }

  let csvContent = "\uFEFF";
  csvContent += "Nome,CPF,E-mail,Telefone,Dias Contratados,Qtd Dias,Valor Total,Status,Check-in,Data Check-in,Data Compra\n";

  cachedDiaristasList.forEach(dia => {
    const user = dia.usuario || {};
    const extras = dia.dados_extras || {};
    const nome = `"${(user.nome || '').replace(/"/g, '""')}"`;
    const cpf = `"${(user.cpf || extras.cpf || '').replace(/"/g, '""')}"`;
    const email = `"${(user.email || '').replace(/"/g, '""')}"`;
    const tel = `"${(user.telefone || extras.telefone || '').replace(/"/g, '""')}"`;
    const dias = `"${(Array.isArray(dia.dias_selecionados) ? dia.dias_selecionados.join('; ') : String(dia.dias_selecionados || '')).replace(/"/g, '""')}"`;
    const qtd = dia.quantidade_dias || 1;
    const valor = parseFloat(dia.valor_total || 0).toFixed(2);
    const status = dia.status || '';
    const checkin = dia.checkin_realizado ? 'Presente' : 'Ausente';
    const checkinData = dia.checkin_data ? new Date(dia.checkin_data).toLocaleString('pt-BR') : '';
    const dataCompra = dia.created_at ? new Date(dia.created_at).toLocaleString('pt-BR') : '';

    csvContent += `${nome},${cpf},${email},${tel},${dias},${qtd},${valor},${status},${checkin},${checkinData},${dataCompra}\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `diaristas_evento_${selectedEventoId}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// ==========================================================================
// ABA DASHBOARD & GRÁFICOS DO EVENTO
// ==========================================================================

let dashboardStatsData = null;
let chartInstances = {
  idadeMenorMaior: null,
  faixasEtarias: null,
  sexo: null,
  estadoCivil: null,
  presbiterios: null,
  igrejas: null,
  camisetas: null,
  statusInscricoes: null
};

function destruirGraficosDashboard() {
  Object.keys(chartInstances).forEach(k => {
    if (chartInstances[k]) {
      try { chartInstances[k].destroy(); } catch (e) {}
      chartInstances[k] = null;
    }
  });
}

window.recarregarDashboardFiltro = function() {
  carregarDashboardEvento(true);
};

window.carregarDashboardEvento = async function(forceReload = false) {
  if (!selectedEventoId) return;

  const filtroStatus = document.getElementById('dashboard-filtro-status')?.value || '';
  const iconRefresh = document.getElementById('icon-refresh-dashboard');
  if (iconRefresh) iconRefresh.style.animation = 'spin 1s linear infinite';

  try {
    let stats = null;

    // 1. Tentar obter dados do endpoint do servidor
    try {
      let url = `/admin/eventos/${selectedEventoId}/dashboard-stats`;
      if (filtroStatus) url += `?status_filtro=${encodeURIComponent(filtroStatus)}`;
      stats = await API.request(url);
    } catch (apiErr) {
      console.warn("Endpoint /dashboard-stats indisponível, usando cálculo em memória:", apiErr);
    }

    // 2. Se a API falhou ou não retornou, calcular a partir de cachedInscricoesList
    if (!stats) {
      stats = calcularStatsInscricoesLocal(cachedInscricoesList, filtroStatus);
    }

    dashboardStatsData = stats;
    atualizarKPICardsDashboard(stats, filtroStatus);
    renderizarGraficosDashboard(stats);

    // Auditoria para o Administrador no Console
    const p18 = stats.idade?.participantes_18_anos || [];
    const pMenores = stats.idade?.participantes_menores_18 || [];
    console.group("📊 Auditoria de Idade: Abaixo de 19 Anos");
    console.log(`Total abaixo de 19 anos: ${stats.idade?.abaixo_19 || 0}`);
    console.log(`• Menores de 18 anos (<18): ${pMenores.length}`);
    console.log(`• Exatamente 18 anos completos: ${p18.length}`);
    if (p18.length > 0) {
      console.log("Participantes com exatamente 18 anos completos:");
      console.table(p18.map(p => ({
        ID: p.id,
        Nome: p.nome,
        "Data Nascimento": p.data_nascimento,
        Idade: p.idade,
        Igreja: p.igreja,
        Status: p.status
      })));
    }
    console.groupEnd();

  } catch (err) {
    console.error("Erro ao carregar dados do dashboard:", err);
    if (typeof showToast === 'function') {
      showToast("Erro ao carregar gráficos do evento.", "error");
    }
  } finally {
    if (iconRefresh) iconRefresh.style.animation = 'none';
  }
};

function calcularStatsInscricoesLocal(lista, statusFiltro) {
  const todas = Array.isArray(lista) ? lista : [];
  const stUpper = (statusFiltro || '').toUpperCase().trim();
  const filtradas = (stUpper && stUpper !== 'TODAS' && stUpper !== 'TODOS' && stUpper !== 'ALL')
    ? todas.filter(i => (i.status || '').toUpperCase() === stUpper)
    : todas;

  const totalGeral = todas.length;
  const totalConfirmadas = todas.filter(i => (i.status || '').toUpperCase() === 'CONFIRMADA').length;
  const totalPendentes = todas.filter(i => (i.status || '').toUpperCase() === 'PENDENTE').length;
  const totalCanceladas = todas.filter(i => (i.status || '').toUpperCase() === 'CANCELADA').length;
  const totalCheckin = todas.filter(i => i.checkin_realizado).length;

  const valorArrecadado = todas
    .filter(i => (i.status || '').toUpperCase() === 'CONFIRMADA')
    .reduce((acc, cur) => acc + parseFloat(cur.valor_total || 0), 0);

  const valorPendente = todas
    .filter(i => (i.status || '').toUpperCase() === 'PENDENTE')
    .reduce((acc, cur) => acc + parseFloat(cur.valor_total || 0), 0);

  const hoje = new Date();
  let abaixo19 = 0;
  let mais19 = 0;
  let menores18 = 0;
  let maiores18 = 0;
  let idadeNaoInformada = 0;
  const idades = [];
  const listaAbaixo19 = [];
  const listaExatamente18 = [];
  const listaMenores18 = [];

  const faixas = {
    "< 19 anos": 0,
    "19 a 21 anos": 0,
    "22 a 25 anos": 0,
    "26 a 30 anos": 0,
    "31 a 40 anos": 0,
    "40+ anos": 0,
    "Não informada": 0
  };

  const igrejasContagem = {};
  const presbiteriosContagem = {};
  const sexoContagem = { "Masculino": 0, "Feminino": 0, "Não informado": 0 };
  const estadoCivilContagem = {};
  const camisetasContagem = {};
  const statusContagem = { "CONFIRMADA": 0, "PENDENTE": 0, "CANCELADA": 0 };

  function extrairCampo(extras, ...nomes) {
    if (!extras || typeof extras !== 'object') return null;
    for (const n of nomes) {
      const v = extras[n] || extras[`dyn_${n}`] || extras[n.toLowerCase()];
      if (v !== undefined && v !== null && String(v).trim()) {
        return String(v).trim();
      }
    }
    return null;
  }

  function parseIdade(dtStr) {
    if (!dtStr || typeof dtStr !== 'string') return null;
    let dia, mes, ano;
    if (dtStr.includes('T')) dtStr = dtStr.split('T')[0];
    if (dtStr.includes('-')) {
      const p = dtStr.split('-');
      if (p[0].length === 4) {
        ano = parseInt(p[0], 10);
        mes = parseInt(p[1], 10) - 1;
        dia = parseInt(p[2], 10);
      } else if (p[2].length === 4) {
        dia = parseInt(p[0], 10);
        mes = parseInt(p[1], 10) - 1;
        ano = parseInt(p[2], 10);
      } else {
        return null;
      }
    } else if (dtStr.includes('/')) {
      const p = dtStr.split('/');
      if (p[2].length === 4) {
        dia = parseInt(p[0], 10);
        mes = parseInt(p[1], 10) - 1;
        ano = parseInt(p[2], 10);
      } else if (p[0].length === 4) {
        ano = parseInt(p[0], 10);
        mes = parseInt(p[1], 10) - 1;
        dia = parseInt(p[2], 10);
      } else {
        return null;
      }
    } else {
      return null;
    }
    if (isNaN(ano) || isNaN(mes) || isNaN(dia)) return null;
    let id = hoje.getFullYear() - ano;
    const m = hoje.getMonth() - mes;
    if (m < 0 || (m === 0 && hoje.getDate() < dia)) id--;
    if (id >= 0 && id <= 125) return id;
    return null;
  }

  filtradas.forEach(ins => {
    const ext = ins.dados_extras || {};
    const st = (ins.status || 'PENDENTE').toUpperCase();
    statusContagem[st] = (statusContagem[st] || 0) + 1;

    // Idade
    const dtNasc = extrairCampo(ext, 'data_nascimento', 'nascimento');
    const id = parseIdade(dtNasc);
    if (id !== null) {
      idades.push(id);
      const pAudit = {
        id: ins.id,
        nome: ins.usuario?.nome || 'Participante',
        data_nascimento: dtNasc,
        idade: id,
        tipo_faixa: id === 18 ? '18 anos completos' : 'Menor (<18)',
        igreja: extrairCampo(ext, 'igreja') || 'Não informada',
        status: ins.status || 'PENDENTE'
      };

      if (id < 18) {
        menores18++;
        listaMenores18.push(pAudit);
      } else if (id === 18) {
        listaExatamente18.push(pAudit);
      }

      if (id >= 18) {
        maiores18++;
      }

      if (id < 19) {
        abaixo19++;
        faixas["< 19 anos"]++;
        listaAbaixo19.push(pAudit);
      } else {
        mais19++;
        if (id <= 21) faixas["19 a 21 anos"]++;
        else if (id <= 25) faixas["22 a 25 anos"]++;
        else if (id <= 30) faixas["26 a 30 anos"]++;
        else if (id <= 40) faixas["31 a 40 anos"]++;
        else faixas["40+ anos"]++;
      }
    } else {
      idadeNaoInformada++;
      faixas["Não informada"]++;
    }

    // Igreja
    const ig = extrairCampo(ext, 'igreja') || 'Não informada';
    igrejasContagem[ig] = (igrejasContagem[ig] || 0) + 1;

    // Presbitério
    const presb = extrairCampo(ext, 'presbiterio') || 'Não informado';
    presbiteriosContagem[presb] = (presbiteriosContagem[presb] || 0) + 1;

    // Sexo
    const sx = extrairCampo(ext, 'genero', 'sexo');
    if (sx) {
      const sLower = sx.toLowerCase();
      if (sLower.startsWith('m')) sexoContagem["Masculino"]++;
      else if (sLower.startsWith('f')) sexoContagem["Feminino"]++;
      else sexoContagem["Não informado"]++;
    } else {
      sexoContagem["Não informado"]++;
    }

    // Estado Civil
    const ec = extrairCampo(ext, 'estado_civil') || 'Não informado';
    estadoCivilContagem[ec] = (estadoCivilContagem[ec] || 0) + 1;

    // Camiseta
    const cam = extrairCampo(ext, 'tamanho_camiseta', 'camiseta');
    if (cam) {
      const camUp = cam.toUpperCase();
      camisetasContagem[camUp] = (camisetasContagem[camUp] || 0) + 1;
    }
  });

  const topIgrejas = Object.keys(igrejasContagem)
    .map(k => ({ nome: k, quantidade: igrejasContagem[k] }))
    .sort((a, b) => b.quantidade - a.quantidade);

  const topPresb = Object.keys(presbiteriosContagem)
    .map(k => ({ nome: k, quantidade: presbiteriosContagem[k] }))
    .sort((a, b) => b.quantidade - a.quantidade);

  const mediaId = idades.length > 0 
    ? (idades.reduce((a, b) => a + b, 0) / idades.length).toFixed(1) 
    : null;

  return {
    evento_id: selectedEventoId,
    status_filtro: statusFiltro || "TODOS",
    total_geral: totalGeral,
    total_analisado: filtradas.length,
    status_resumo: {
      confirmadas: totalConfirmadas,
      pendentes: totalPendentes,
      canceladas: totalCanceladas
    },
    checkin_resumo: {
      realizados: totalCheckin,
      pendentes: Math.max(0, totalConfirmadas - totalCheckin),
      taxa_presenca: totalConfirmadas > 0 ? ((totalCheckin / totalConfirmadas) * 100).toFixed(1) : 0
    },
    financeiro: {
      valor_arrecadado: valorArrecadado,
      valor_pendente: valorPendente
    },
    idade: {
      abaixo_19: abaixo19,
      "19_ou_mais": mais19,
      menores_18: menores18,
      exatamente_18: listaExatamente18.length,
      maiores_18: maiores18,
      nao_informada: idadeNaoInformada,
      media: mediaId ? parseFloat(mediaId) : null,
      minima: idades.length ? Math.min(...idades) : null,
      maxima: idades.length ? Math.max(...idades) : null,
      faixas: faixas,
      participantes_abaixo_19: listaAbaixo19,
      participantes_18_anos: listaExatamente18,
      participantes_menores_18: listaMenores18
    },
    sexo: sexoContagem,
    estado_civil: estadoCivilContagem,
    igrejas: topIgrejas,
    presbiterios: topPresb,
    camisetas: camisetasContagem,
    formas_pagamento: {}
  };
}

function atualizarKPICardsDashboard(stats, filtroStatus) {
  if (!stats) return;

  const totalAnalisado = stats.total_analisado || 0;
  const statusResumo = stats.status_resumo || {};
  const idade = stats.idade || {};
  const checkin = stats.checkin_resumo || {};
  const financeiro = stats.financeiro || {};

  // Badge do Filtro
  const badgeFiltro = document.getElementById('dash-badge-status-filtro');
  if (badgeFiltro) {
    if (!filtroStatus) {
      badgeFiltro.textContent = 'Todas';
      badgeFiltro.style.background = '#E0E7FF';
      badgeFiltro.style.color = '#3730A3';
    } else if (filtroStatus === 'CONFIRMADA') {
      badgeFiltro.textContent = 'Apenas Confirmadas';
      badgeFiltro.style.background = '#DCFCE7';
      badgeFiltro.style.color = '#15803D';
    } else if (filtroStatus === 'PENDENTE') {
      badgeFiltro.textContent = 'Apenas Pendentes';
      badgeFiltro.style.background = '#FEF3C7';
      badgeFiltro.style.color = '#92400E';
    } else {
      badgeFiltro.textContent = 'Canceladas';
      badgeFiltro.style.background = '#FEE2E2';
      badgeFiltro.style.color = '#B91C1C';
    }
  }

  // 1. Total Inscrições (Distinção entre Inscrições Normais e Canceladas)
  const elTotal = document.getElementById('dash-kpi-total');
  const elTotalLabel = document.getElementById('dash-kpi-total-label');
  const elTotalSub = document.getElementById('dash-kpi-total-sub');
  const elCanceladasBox = document.getElementById('dash-kpi-canceladas-box');
  const elCanceladasText = document.getElementById('dash-kpi-canceladas-text');

  const conf = statusResumo.confirmadas || 0;
  const pend = statusResumo.pendentes || 0;
  const canc = statusResumo.canceladas || 0;
  const normais = conf + pend;
  const totalGeral = statusResumo.total_geral !== undefined ? statusResumo.total_geral : (normais + canc);

  if (elCanceladasText) {
    elCanceladasText.textContent = `${canc} Cancelada${canc === 1 ? '' : 's'}`;
  }

  if (elCanceladasBox) {
    if (canc > 0) {
      elCanceladasBox.style.display = 'inline-flex';
    } else {
      elCanceladasBox.style.display = 'none';
    }
  }

  if (elTotal) {
    if (filtroStatus === 'CANCELADA') {
      elTotal.textContent = canc;
      elTotal.style.color = '#DC2626';
      if (elTotalLabel) {
        elTotalLabel.textContent = 'Canceladas';
        elTotalLabel.style.color = '#DC2626';
      }
    } else if (filtroStatus === 'CONFIRMADA') {
      elTotal.textContent = conf;
      elTotal.style.color = '#10B981';
      if (elTotalLabel) {
        elTotalLabel.textContent = 'Confirmadas';
        elTotalLabel.style.color = '#10B981';
      }
    } else if (filtroStatus === 'PENDENTE') {
      elTotal.textContent = pend;
      elTotal.style.color = '#F59E0B';
      if (elTotalLabel) {
        elTotalLabel.textContent = 'Pendentes';
        elTotalLabel.style.color = '#F59E0B';
      }
    } else {
      // Todas as Inscrições: destaque principal para as inscrições Normais (Ativas)
      elTotal.textContent = normais;
      elTotal.style.color = '#1D4ED8';
      if (elTotalLabel) {
        elTotalLabel.textContent = 'Normais';
        elTotalLabel.style.color = '#1D4ED8';
      }
    }
  }

  if (elTotalSub) {
    if (filtroStatus === 'CANCELADA') {
      elTotalSub.innerHTML = `Exibindo apenas canceladas • Total de registros: <strong>${canc}</strong>`;
    } else if (filtroStatus === 'CONFIRMADA') {
      elTotalSub.innerHTML = `<strong>${conf}</strong> confirmadas válidas • ${canc} canceladas no evento`;
    } else if (filtroStatus === 'PENDENTE') {
      elTotalSub.innerHTML = `<strong>${pend}</strong> pendentes de pagamento • ${canc} canceladas no evento`;
    } else {
      // Todas
      elTotalSub.innerHTML = `<strong>${conf}</strong> confirmadas • <strong>${pend}</strong> pendentes <span style="color:#94A3B8;">(Total geral: ${totalGeral})</span>`;
    }
  }

  // 2. Abaixo de 19 Anos (Até 18 anos, 11 meses e 29 dias)
  const abaixo19 = (idade.abaixo_19 !== undefined) ? idade.abaixo_19 : (idade.menores_18 || 0);
  const mais19 = (idade['19_ou_mais'] !== undefined) ? idade['19_ou_mais'] : (idade.maiores_18 || 0);
  const total18 = (idade.exatamente_18 !== undefined) ? idade.exatamente_18 : Math.max(0, abaixo19 - (idade.menores_18 || 0));
  const menores18 = (idade.menores_18 !== undefined) ? idade.menores_18 : Math.max(0, abaixo19 - total18);
  const totalComIdade = abaixo19 + mais19;
  const pctAbaixo19 = totalComIdade > 0 ? Math.round((abaixo19 / totalComIdade) * 100) : 0;

  const elMenores = document.getElementById('dash-kpi-menores');
  const elIdadeBadge = document.getElementById('dash-kpi-idade-badge');
  const elIdadeSub = document.getElementById('dash-kpi-idade-sub');
  if (elMenores) elMenores.textContent = abaixo19;
  if (elIdadeBadge) elIdadeBadge.textContent = `${pctAbaixo19}% <19`;
  if (elIdadeSub) {
    elIdadeSub.innerHTML = `<strong>${menores18}</strong> &lt;18 anos • <strong>${total18}</strong> com 18 anos • <strong>${mais19}</strong> com 19+`;
  }

  // 3. Média de Idade
  const elMedia = document.getElementById('dash-kpi-media-idade');
  const elMediaSub = document.getElementById('dash-kpi-media-idade-sub');
  if (elMedia) {
    elMedia.textContent = idade.media ? `${idade.media} anos` : '-';
  }
  if (elMediaSub) {
    const minTxt = idade.minima !== null && idade.minima !== undefined ? `${idade.minima} anos` : '-';
    const maxTxt = idade.maxima !== null && idade.maxima !== undefined ? `${idade.maxima} anos` : '-';
    elMediaSub.textContent = `Mín: ${minTxt} • Máx: ${maxTxt}`;
  }

  // 4. Check-in
  const elCheckin = document.getElementById('dash-kpi-checkin');
  const elCheckinTaxa = document.getElementById('dash-kpi-checkin-taxa');
  const elCheckinSub = document.getElementById('dash-kpi-checkin-sub');
  if (elCheckin) elCheckin.textContent = checkin.realizados || 0;
  if (elCheckinTaxa) elCheckinTaxa.textContent = `${checkin.taxa_presenca || 0}%`;
  if (elCheckinSub) {
    elCheckinSub.textContent = `${checkin.realizados || 0} de ${statusResumo.confirmadas || 0} confirmados presentes`;
  }

  // 5. Total Arrecadado
  const elFin = document.getElementById('dash-kpi-financeiro');
  const elFinSub = document.getElementById('dash-kpi-financeiro-sub');
  if (elFin) {
    const arrecadado = parseFloat(financeiro.valor_arrecadado || 0);
    elFin.textContent = arrecadado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  if (elFinSub) {
    const pendente = parseFloat(financeiro.valor_pendente || 0);
    elFinSub.textContent = `Pendente: ${pendente.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
  }
}

function renderizarGraficosDashboard(stats) {
  if (!stats) return;

  if (typeof Chart === 'undefined') {
    setTimeout(() => renderizarGraficosDashboard(stats), 300);
    return;
  }

  // Destruir gráficos anteriores para evitar sobreposição
  destruirGraficosDashboard();

  // Configurações globais padrão do Chart.js
  Chart.defaults.font.family = "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
  Chart.defaults.color = '#64748B';

  const pluginTooltip = {
    backgroundColor: '#0F172A',
    titleColor: '#F8FAFC',
    bodyColor: '#F1F5F9',
    titleFont: { size: 13, weight: '700' },
    bodyFont: { size: 12 },
    padding: 10,
    cornerRadius: 8,
    boxPadding: 4
  };

  // -------------------------------------------------------------
  // 1. Gráfico Abaixo de 19 Anos vs 19+ Anos (Donut)
  // -------------------------------------------------------------
  const ctxIdade = document.getElementById('chart-idade-menor-maior')?.getContext('2d');
  if (ctxIdade) {
    const abaixo19 = (stats.idade?.abaixo_19 !== undefined) ? stats.idade.abaixo_19 : (stats.idade?.menores_18 || 0);
    const mais19 = (stats.idade?.['19_ou_mais'] !== undefined) ? stats.idade['19_ou_mais'] : (stats.idade?.maiores_18 || 0);
    const naoInf = stats.idade?.nao_informada || 0;
    const totalComIdade = abaixo19 + mais19;

    const labels = ['Abaixo de 19 (<19)', '19 anos ou mais (≥19)'];
    const dataVals = [abaixo19, mais19];
    const bgColors = ['#F59E0B', '#1D4ED8'];
    const hoverColors = ['#D97706', '#1E40AF'];

    if (naoInf > 0) {
      labels.push('Não informado');
      dataVals.push(naoInf);
      bgColors.push('#CBD5E1');
      hoverColors.push('#94A3B8');
    }

    const totalTotal = dataVals.reduce((a, b) => a + b, 0);

    chartInstances.idadeMenorMaior = new Chart(ctxIdade, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: totalTotal > 0 ? dataVals : [1],
          backgroundColor: totalTotal > 0 ? bgColors : ['#E2E8F0'],
          hoverBackgroundColor: totalTotal > 0 ? hoverColors : ['#CBD5E1'],
          borderWidth: 2,
          borderColor: '#FFFFFF'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, padding: 12, font: { size: 11, weight: '600' } }
          },
          tooltip: {
            ...pluginTooltip,
            callbacks: {
              label: function(ctx) {
                if (totalTotal === 0) return ' Nenhuma inscrição';
                const val = ctx.raw;
                const pct = totalTotal > 0 ? Math.round((val / totalTotal) * 100) : 0;
                let extraHint = '';
                if (ctx.label.includes('<19')) extraHint = ' (até 18 anos completos)';
                return ` ${ctx.label}${extraHint}: ${val} (${pct}%)`;
              }
            }
          }
        }
      }
    });

    const footerIdade = document.getElementById('footer-idade-resumo');
    if (footerIdade) {
      if (totalComIdade > 0) {
        const pctAbaixo = Math.round((abaixo19 / totalComIdade) * 100);
        const pctMais = Math.round((mais19 / totalComIdade) * 100);
        footerIdade.innerHTML = `
          <span><strong>${abaixo19} abaixo de 19 anos</strong> (${pctAbaixo}%)</span>
          <span><strong>${mais19} com 19+ anos</strong> (${pctMais}%)</span>
        `;
      } else {
        footerIdade.innerHTML = `<span>Nenhuma data de nascimento informada.</span>`;
      }
    }
  }

  // -------------------------------------------------------------
  // 2. Gráfico Faixas Etárias (Barra Vertical)
  // -------------------------------------------------------------
  const ctxFaixas = document.getElementById('chart-faixas-etarias')?.getContext('2d');
  if (ctxFaixas) {
    const faixasObj = stats.idade?.faixas || {};
    const labelsFaixas = ['< 19 anos', '19 a 21 anos', '22 a 25 anos', '26 a 30 anos', '31 a 40 anos', '40+ anos'];
    const dataFaixas = labelsFaixas.map(l => faixasObj[l] || 0);

    if ((faixasObj['Não informada'] || 0) > 0) {
      labelsFaixas.push('Não inf.');
      dataFaixas.push(faixasObj['Não informada']);
    }

    chartInstances.faixasEtarias = new Chart(ctxFaixas, {
      type: 'bar',
      data: {
        labels: labelsFaixas,
        datasets: [{
          label: 'Inscritos',
          data: dataFaixas,
          backgroundColor: ['#F59E0B', '#3B82F6', '#1D4ED8', '#7C3AED', '#8B5CF6', '#10B981', '#94A3B8'],
          borderRadius: 6,
          maxBarThickness: 38
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...pluginTooltip,
            callbacks: {
              afterLabel: function(ctx) {
                if (ctx.label === '< 19 anos') {
                  return 'Participantes até 18 anos, 11 meses e 29 dias (não completaram 19 anos)';
                }
                return '';
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
            grid: { color: '#F1F5F9' }
          },
          x: {
            grid: { display: false },
            ticks: { font: { size: 10 } }
          }
        }
      }
    });

    const footerFaixas = document.getElementById('footer-faixas-resumo');
    if (footerFaixas) {
      const media = stats.idade?.media;
      const totalAbaixo19 = faixasObj['< 19 anos'] || 0;
      footerFaixas.innerHTML = `
        <span>Abaixo de 19 anos: <strong>${totalAbaixo19} participantes</strong></span>
        <span>Média: <strong>${media ? media + ' anos' : '-'}</strong></span>
      `;
    }
  }


  // -------------------------------------------------------------
  // 3. Gráfico Distribuição por Sexo (Donut)
  // -------------------------------------------------------------
  const ctxSexo = document.getElementById('chart-sexo')?.getContext('2d');
  if (ctxSexo) {
    const sexoObj = stats.sexo || {};
    const masc = sexoObj['Masculino'] || 0;
    const fem = sexoObj['Feminino'] || 0;
    const outro = sexoObj['Não informado'] || 0;

    const labelsSexo = ['Masculino', 'Feminino'];
    const dataSexo = [masc, fem];
    const colorsSexo = ['#3B82F6', '#EC4899'];

    if (outro > 0) {
      labelsSexo.push('Não informado');
      dataSexo.push(outro);
      colorsSexo.push('#CBD5E1');
    }

    const totalSexo = dataSexo.reduce((a, b) => a + b, 0);

    chartInstances.sexo = new Chart(ctxSexo, {
      type: 'doughnut',
      data: {
        labels: labelsSexo,
        datasets: [{
          data: totalSexo > 0 ? dataSexo : [1],
          backgroundColor: totalSexo > 0 ? colorsSexo : ['#E2E8F0'],
          borderWidth: 2,
          borderColor: '#FFFFFF'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, padding: 12, font: { size: 11, weight: '600' } }
          },
          tooltip: {
            ...pluginTooltip,
            callbacks: {
              label: function(ctx) {
                if (totalSexo === 0) return ' Nenhuma informação';
                const val = ctx.raw;
                const pct = totalSexo > 0 ? Math.round((val / totalSexo) * 100) : 0;
                return ` ${ctx.label}: ${val} (${pct}%)`;
              }
            }
          }
        }
      }
    });

    const footerSexo = document.getElementById('footer-sexo-resumo');
    if (footerSexo) {
      if (totalSexo > 0) {
        const pctM = Math.round((masc / totalSexo) * 100);
        const pctF = Math.round((fem / totalSexo) * 100);
        footerSexo.innerHTML = `
          <span>👨 <strong>${masc}</strong> (${pctM}%) Masculino</span>
          <span>👩 <strong>${fem}</strong> (${pctF}%) Feminino</span>
        `;
      } else {
        footerSexo.innerHTML = `<span>Dados de sexo não informados.</span>`;
      }
    }
  }

  // -------------------------------------------------------------
  // 4. Gráfico Estado Civil (Donut)
  // -------------------------------------------------------------
  const ctxEC = document.getElementById('chart-estado-civil')?.getContext('2d');
  if (ctxEC) {
    const ecObj = stats.estado_civil || {};
    const labelsEC = Object.keys(ecObj);
    const dataEC = labelsEC.map(k => ecObj[k]);
    const paletteEC = ['#6366F1', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#94A3B8'];

    const totalEC = dataEC.reduce((a, b) => a + b, 0);

    chartInstances.estadoCivil = new Chart(ctxEC, {
      type: 'doughnut',
      data: {
        labels: labelsEC.length ? labelsEC : ['Sem dados'],
        datasets: [{
          data: totalEC > 0 ? dataEC : [1],
          backgroundColor: totalEC > 0 ? paletteEC.slice(0, labelsEC.length) : ['#E2E8F0'],
          borderWidth: 2,
          borderColor: '#FFFFFF'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '66%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, padding: 10, font: { size: 11, weight: '600' } }
          },
          tooltip: {
            ...pluginTooltip,
            callbacks: {
              label: function(ctx) {
                if (totalEC === 0) return ' Nenhuma informação';
                const val = ctx.raw;
                const pct = totalEC > 0 ? Math.round((val / totalEC) * 100) : 0;
                return ` ${ctx.label}: ${val} (${pct}%)`;
              }
            }
          }
        }
      }
    });

    const footerEC = document.getElementById('footer-estado-civil-resumo');
    if (footerEC) {
      const topEC = labelsEC.length ? labelsEC.reduce((a, b) => (ecObj[a] >= ecObj[b] ? a : b), labelsEC[0]) : null;
      if (topEC && ecObj[topEC] > 0) {
        footerEC.innerHTML = `<span>Perfil predominante: <strong>${topEC} (${ecObj[topEC]} inscritos)</strong></span>`;
      } else {
        footerEC.innerHTML = `<span>Dados de estado civil não informados.</span>`;
      }
    }
  }

  // -------------------------------------------------------------
  // 5. Gráfico Presbitérios (Barra Horizontal)
  // -------------------------------------------------------------
  const ctxPresb = document.getElementById('chart-presbiterios')?.getContext('2d');
  if (ctxPresb) {
    const presbLista = stats.presbiterios || [];
    const topPresb = presbLista.slice(0, 10);
    const labelsPresb = topPresb.map(p => p.nome || 'Não informado');
    const dataPresb = topPresb.map(p => p.quantidade || 0);

    chartInstances.presbiterios = new Chart(ctxPresb, {
      type: 'bar',
      data: {
        labels: labelsPresb.length ? labelsPresb : ['Nenhum registro'],
        datasets: [{
          label: 'Inscritos',
          data: dataPresb.length ? dataPresb : [0],
          backgroundColor: '#0891B2',
          borderRadius: 6,
          maxBarThickness: 24
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: pluginTooltip
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { precision: 0 },
            grid: { color: '#F1F5F9' }
          },
          y: {
            grid: { display: false },
            ticks: { font: { size: 11, weight: '600' } }
          }
        }
      }
    });

    const footerPresb = document.getElementById('footer-presbiterios-resumo');
    if (footerPresb) {
      footerPresb.innerHTML = `
        <span>Total de presbitérios representados: <strong>${presbLista.length}</strong></span>
        <span>Mais representado: <strong>${topPresb[0] ? topPresb[0].nome + ' (' + topPresb[0].quantidade + ')' : '-'}</strong></span>
      `;
    }
  }

  // -------------------------------------------------------------
  // 6. Gráfico Igrejas (Top 10 Horizontal Bar + Ranking Box)
  // -------------------------------------------------------------
  const ctxIgrejas = document.getElementById('chart-igrejas')?.getContext('2d');
  const igrejasLista = stats.igrejas || [];
  const top10Igrejas = igrejasLista.slice(0, 8);
  const totalInscritosAnalisados = stats.total_analisado || 1;

  if (ctxIgrejas) {
    const labelsIgrejas = top10Igrejas.map(ig => {
      const n = ig.nome || 'Não informada';
      return n.length > 28 ? n.substring(0, 26) + '...' : n;
    });
    const dataIgrejas = top10Igrejas.map(ig => ig.quantidade || 0);

    chartInstances.igrejas = new Chart(ctxIgrejas, {
      type: 'bar',
      data: {
        labels: labelsIgrejas.length ? labelsIgrejas : ['Nenhuma igreja'],
        datasets: [{
          label: 'Inscritos',
          data: dataIgrejas.length ? dataIgrejas : [0],
          backgroundColor: '#10B981',
          hoverBackgroundColor: '#059669',
          borderRadius: 6,
          maxBarThickness: 24
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: pluginTooltip
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { precision: 0 },
            grid: { color: '#F1F5F9' }
          },
          y: {
            grid: { display: false },
            ticks: { font: { size: 11, weight: '600' } }
          }
        }
      }
    });

    const footerIgrejas = document.getElementById('footer-igrejas-resumo');
    if (footerIgrejas) {
      footerIgrejas.innerHTML = `
        <span>Total de igrejas presentes: <strong>${igrejasLista.length}</strong></span>
        <span>Maior delegação: <strong>${top10Igrejas[0] ? top10Igrejas[0].nome + ' (' + top10Igrejas[0].quantidade + ')' : '-'}</strong></span>
      `;
    }
  }

  // Preencher Ranking Box das Igrejas
  const rankingList = document.getElementById('ranking-igrejas-list');
  const rankingTotal = document.getElementById('ranking-igrejas-total');
  if (rankingTotal) rankingTotal.textContent = `${igrejasLista.length} igrejas`;

  if (rankingList) {
    if (igrejasLista.length === 0) {
      rankingList.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 1.5rem 0;">Nenhuma igreja registrada.</div>`;
    } else {
      rankingList.innerHTML = igrejasLista.slice(0, 10).map((ig, idx) => {
        const pos = idx + 1;
        let posClass = 'ranking-pos-other';
        if (pos === 1) posClass = 'ranking-pos-1';
        else if (pos === 2) posClass = 'ranking-pos-2';
        else if (pos === 3) posClass = 'ranking-pos-3';

        const pct = Math.round((ig.quantidade / totalInscritosAnalisados) * 100);

        return `
          <div class="ranking-row">
            <div style="display: flex; align-items: center; gap: 0.4rem; overflow: hidden;">
              <span class="ranking-pos ${posClass}">${pos}</span>
              <span style="font-weight: 600; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px;" title="${ig.nome}">
                ${ig.nome}
              </span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.4rem;">
              <span class="badge" style="background: #DCFCE7; color: #15803D; font-weight: 700; font-size: 0.75rem;">
                ${ig.quantidade}
              </span>
              <span style="font-size: 0.725rem; color: var(--text-muted); min-width: 32px; text-align: right;">
                ${pct}%
              </span>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // -------------------------------------------------------------
  // 7. Gráfico Tamanhos de Camiseta (Barra Vertical)
  // -------------------------------------------------------------
  const ctxCam = document.getElementById('chart-camisetas')?.getContext('2d');
  if (ctxCam) {
    const camObj = stats.camisetas || {};
    const tamanhosPadrao = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG'];
    const outrosTamanhos = Object.keys(camObj).filter(k => !tamanhosPadrao.includes(k));
    const labelsCam = [...tamanhosPadrao, ...outrosTamanhos].filter(t => (camObj[t] || 0) > 0 || tamanhosPadrao.includes(t));
    const dataCam = labelsCam.map(t => camObj[t] || 0);

    const totalCam = dataCam.reduce((a, b) => a + b, 0);

    chartInstances.camisetas = new Chart(ctxCam, {
      type: 'bar',
      data: {
        labels: labelsCam,
        datasets: [{
          label: 'Camisetas',
          data: dataCam,
          backgroundColor: '#EAB308',
          hoverBackgroundColor: '#CA8A04',
          borderRadius: 6,
          maxBarThickness: 32
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: pluginTooltip
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
            grid: { color: '#F1F5F9' }
          },
          x: {
            grid: { display: false },
            ticks: { font: { weight: '700' } }
          }
        }
      }
    });

    const footerCam = document.getElementById('footer-camisetas-resumo');
    if (footerCam) {
      if (totalCam > 0) {
        const topCam = labelsCam.reduce((a, b) => ((camObj[a] || 0) >= (camObj[b] || 0) ? a : b), labelsCam[0]);
        footerCam.innerHTML = `
          <span>Total de camisas solicitadas: <strong>${totalCam}</strong></span>
          <span>Mais pedido: <strong>Tamanho ${topCam} (${camObj[topCam] || 0})</strong></span>
        `;
      } else {
        footerCam.innerHTML = `<span>Nenhum tamanho informado nas inscrições.</span>`;
      }
    }
  }

  // -------------------------------------------------------------
  // 8. Gráfico Status Geral das Inscrições (Donut)
  // -------------------------------------------------------------
  const ctxStatus = document.getElementById('chart-status-inscricoes')?.getContext('2d');
  if (ctxStatus) {
    const statusResumo = stats.status_resumo || {};
    const conf = statusResumo.confirmadas || 0;
    const pend = statusResumo.pendentes || 0;
    const canc = statusResumo.canceladas || 0;
    const totalGeral = conf + pend + canc;

    chartInstances.statusInscricoes = new Chart(ctxStatus, {
      type: 'doughnut',
      data: {
        labels: ['Confirmadas', 'Pendentes', 'Canceladas'],
        datasets: [{
          data: totalGeral > 0 ? [conf, pend, canc] : [1],
          backgroundColor: totalGeral > 0 ? ['#10B981', '#F59E0B', '#EF4444'] : ['#E2E8F0'],
          borderWidth: 2,
          borderColor: '#FFFFFF'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, padding: 12, font: { size: 11, weight: '600' } }
          },
          tooltip: {
            ...pluginTooltip,
            callbacks: {
              label: function(ctx) {
                if (totalGeral === 0) return ' Nenhuma inscrição';
                const val = ctx.raw;
                const pct = totalGeral > 0 ? Math.round((val / totalGeral) * 100) : 0;
                return ` ${ctx.label}: ${val} (${pct}%)`;
              }
            }
          }
        }
      }
    });

    const footerStatus = document.getElementById('footer-status-resumo');
    if (footerStatus) {
      const taxa = totalGeral > 0 ? Math.round((conf / totalGeral) * 100) : 0;
      footerStatus.innerHTML = `
        <span>Taxa de Confirmação: <strong>${taxa}%</strong></span>
        <span>Aguardando Pagamento: <strong>${pend}</strong></span>
      `;
    }
  }
}

window.imprimirResumoDashboard = function() {
  if (!dashboardStatsData) {
    if (typeof showToast === 'function') showToast("Carregando estatísticas...", "info");
    return;
  }

  const s = dashboardStatsData;
  const evTitulo = eventoAtual?.titulo || 'Evento';
  const dataHoje = new Date().toLocaleDateString('pt-BR');
  const horaHoje = new Date().toLocaleTimeString('pt-BR');

  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Relatório Executivo - ${evTitulo}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 2rem; color: #1E293B; line-height: 1.5; }
        h1 { font-size: 1.5rem; margin-bottom: 0.25rem; color: #1D4ED8; font-weight: 800; }
        .meta { font-size: 0.85rem; color: #64748B; margin-bottom: 1.75rem; border-bottom: 1px solid #E2E8F0; padding-bottom: 0.75rem; }
        .grid-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.75rem; }
        .kpi-box { background: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 8px; padding: 0.85rem 1rem; }
        .kpi-box-title { font-size: 0.72rem; text-transform: uppercase; color: #64748B; font-weight: 700; letter-spacing: 0.05em; }
        .kpi-box-val { font-size: 1.45rem; font-weight: 800; color: #0F172A; margin-top: 0.2rem; }
        .section-title { font-size: 1.05rem; font-weight: 700; margin-top: 1.75rem; margin-bottom: 0.65rem; border-bottom: 2px solid #E2E8F0; padding-bottom: 0.35rem; color: #1E293B; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; font-size: 0.85rem; }
        th, td { border: 1px solid #E2E8F0; padding: 0.45rem 0.65rem; text-align: left; }
        th { background: #F1F5F9; font-weight: 700; color: #334155; }
        @media print { body { padding: 0.4cm; } button { display: none; } }
      </style>
    </head>
    <body>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <div>
          <h1>Relatório Executivo do Evento</h1>
          <div style="font-size: 0.95rem; font-weight: 600; color: #334155;">${evTitulo}</div>
        </div>
        <button onclick="window.print()" style="padding: 0.5rem 1rem; background: #1D4ED8; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Imprimir</button>
      </div>
      <div class="meta">
        <strong>Data de Emissão:</strong> ${dataHoje} às ${horaHoje} &bull; <strong>Filtro Aplicado:</strong> ${s.status_filtro || 'TODAS'}
      </div>

      <div class="grid-kpis">
        <div class="kpi-box">
          <div class="kpi-box-title">Inscrições Normais (Ativas)</div>
          <div class="kpi-box-val" style="color: #1D4ED8;">${(s.status_resumo?.confirmadas || 0) + (s.status_resumo?.pendentes || 0)}</div>
          <div style="font-size: 0.75rem; color: #64748B;">
            ${s.status_resumo?.confirmadas || 0} confirmadas • ${s.status_resumo?.pendentes || 0} pendentes<br>
            <span style="color: #DC2626; font-weight: 700;">${s.status_resumo?.canceladas || 0} canceladas</span> (Total geral: ${s.total_analisado || 0})
          </div>
        </div>
        <div class="kpi-box">
          <div class="kpi-box-title">Abaixo de 19 Anos</div>
          <div class="kpi-box-val">${(s.idade?.abaixo_19 !== undefined) ? s.idade.abaixo_19 : (s.idade?.menores_18 || 0)}</div>
          <div style="font-size: 0.75rem; color: #64748B;">${(s.idade?.['19_ou_mais'] !== undefined) ? s.idade['19_ou_mais'] : (s.idade?.maiores_18 || 0)} com 19 anos ou mais</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-box-title">Média de Idade</div>
          <div class="kpi-box-val">${s.idade?.media ? s.idade.media + ' anos' : '-'}</div>
          <div style="font-size: 0.75rem; color: #64748B;">Mín: ${s.idade?.minima !== null ? s.idade.minima : '-'} | Máx: ${s.idade?.maxima !== null ? s.idade.maxima : '-'}</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-box-title">Total Arrecadado</div>
          <div class="kpi-box-val" style="color: #059669;">${(s.financeiro?.valor_arrecadado || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
          <div style="font-size: 0.75rem; color: #64748B;">Pendente: ${(s.financeiro?.valor_pendente || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
        </div>
      </div>

      <div class="section-title">Demografia & Faixa Etária</div>
      <table>
        <thead>
          <tr><th>Métrica</th><th>Quantidade</th><th>Proporção (%)</th></tr>
        </thead>
        <tbody>
          <tr><td>Participantes Masculinos</td><td>${s.sexo?.Masculino || 0}</td><td>${s.total_analisado ? Math.round(((s.sexo?.Masculino || 0) / s.total_analisado) * 100) : 0}%</td></tr>
          <tr><td>Participantes Femininos</td><td>${s.sexo?.Feminino || 0}</td><td>${s.total_analisado ? Math.round(((s.sexo?.Feminino || 0) / s.total_analisado) * 100) : 0}%</td></tr>
          <tr><td>Abaixo de 19 anos (&lt;19 - até 18 anos completos)</td><td>${(s.idade?.abaixo_19 !== undefined) ? s.idade.abaixo_19 : (s.idade?.menores_18 || 0)}</td><td>${s.total_analisado ? Math.round((((s.idade?.abaixo_19 !== undefined) ? s.idade.abaixo_19 : (s.idade?.menores_18 || 0)) / s.total_analisado) * 100) : 0}%</td></tr>
          <tr><td>19 anos ou mais (&ge;19)</td><td>${(s.idade?.['19_ou_mais'] !== undefined) ? s.idade['19_ou_mais'] : (s.idade?.maiores_18 || 0)}</td><td>${s.total_analisado ? Math.round((((s.idade?.['19_ou_mais'] !== undefined) ? s.idade['19_ou_mais'] : (s.idade?.maiores_18 || 0)) / s.total_analisado) * 100) : 0}%</td></tr>
        </tbody>
      </table>

      <div class="section-title">Ranking das Igrejas Representadas</div>
      <table>
        <thead>
          <tr><th>#</th><th>Igreja</th><th>Inscritos</th><th>Percentual</th></tr>
        </thead>
        <tbody>
          ${(s.igrejas || []).slice(0, 15).map((ig, i) => `
            <tr>
              <td><strong>${i + 1}º</strong></td>
              <td>${ig.nome}</td>
              <td><strong>${ig.quantidade}</strong></td>
              <td>${s.total_analisado ? Math.round((ig.quantidade / s.total_analisado) * 100) : 0}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="section-title">Presbitérios Representados</div>
      <table>
        <thead>
          <tr><th>#</th><th>Presbitério</th><th>Inscritos</th></tr>
        </thead>
        <tbody>
          ${(s.presbiterios || []).map((p, i) => `
            <tr>
              <td>${i + 1}º</td>
              <td>${p.nome}</td>
              <td><strong>${p.quantidade}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </body>
    </html>
  `);
  win.document.close();
};

// =============================================================
// MODAL DE AUDITORIA: PARTICIPANTES ABAIXO DE 19 ANOS
// =============================================================
let filtroAuditoriaAtivo = 'TODOS';

window.abrirModalAuditoriaIdade = function(filtro = 'TODOS') {
  const modal = document.getElementById('modal-auditoria-idade');
  if (!modal) return;
  filtroAuditoriaAtivo = filtro;
  renderizarTabelaAuditoriaIdade();
  modal.style.display = 'flex';
};

window.fecharModalAuditoriaIdade = function() {
  const modal = document.getElementById('modal-auditoria-idade');
  if (modal) modal.style.display = 'none';
};

window.fecharModalAuditoriaIdadeBackdrop = function(e) {
  if (e.target && e.target.id === 'modal-auditoria-idade') {
    window.fecharModalAuditoriaIdade();
  }
};

window.filtrarAuditoriaIdade = function(tipo) {
  filtroAuditoriaAtivo = tipo;
  renderizarTabelaAuditoriaIdade();
};

window.abrirFichaParticipanteAuditoria = function(id) {
  window.fecharModalAuditoriaIdade();
  if (typeof abrirModalInscricao === 'function') {
    abrirModalInscricao(id);
  }
};

function renderizarTabelaAuditoriaIdade() {
  const tbody = document.getElementById('auditoria-idade-table-body');
  if (!tbody) return;

  const stats = dashboardStatsData || {};
  const idade = stats.idade || {};

  // Se a lista de participantes veio da API ou do cálculo local
  let listaCompleta = (idade.participantes_abaixo_19 && idade.participantes_abaixo_19.length > 0)
    ? [...idade.participantes_abaixo_19]
    : [];

  // Se não tem lista no objeto (fallback), reconstruir a partir da cachedInscricoesList
  if (listaCompleta.length === 0 && Array.isArray(cachedInscricoesList)) {
    const hoje = new Date();
    cachedInscricoesList.forEach(ins => {
      const ext = ins.dados_extras || {};
      const dt = extrairCampo(ext, 'data_nascimento', 'nascimento');
      if (dt) {
        let ano, mes, dia;
        if (dt.includes('-')) {
          const p = dt.split('T')[0].split('-');
          if (p[0].length === 4) { ano = parseInt(p[0], 10); mes = parseInt(p[1], 10) - 1; dia = parseInt(p[2], 10); }
          else if (p[2].length === 4) { dia = parseInt(p[0], 10); mes = parseInt(p[1], 10) - 1; ano = parseInt(p[2], 10); }
        } else if (dt.includes('/')) {
          const p = dt.split('/');
          if (p[2].length === 4) { dia = parseInt(p[0], 10); mes = parseInt(p[1], 10) - 1; ano = parseInt(p[2], 10); }
          else if (p[0].length === 4) { ano = parseInt(p[0], 10); mes = parseInt(p[1], 10) - 1; dia = parseInt(p[2], 10); }
        }
        if (!isNaN(ano) && !isNaN(mes) && !isNaN(dia)) {
          let idCalc = hoje.getFullYear() - ano;
          const m = hoje.getMonth() - mes;
          if (m < 0 || (m === 0 && hoje.getDate() < dia)) idCalc--;
          if (idCalc >= 0 && idCalc < 19) {
            listaCompleta.push({
              id: ins.id,
              nome: ins.usuario?.nome || 'Participante',
              data_nascimento: dt,
              idade: idCalc,
              tipo_faixa: idCalc === 18 ? '18 anos completos' : 'Menor (<18)',
              igreja: extrairCampo(ext, 'igreja') || 'Não informada',
              status: ins.status || 'PENDENTE'
            });
          }
        }
      }
    });
  }

  const totalGeral = listaCompleta.length;
  const total18 = listaCompleta.filter(p => p.idade === 18).length;
  const totalMenores = listaCompleta.filter(p => p.idade < 18).length;

  // Atualizar contadores no modal
  const elBadgeTotal = document.getElementById('auditoria-badge-total');
  const elCountTodos = document.getElementById('count-audit-todos');
  const elCount18 = document.getElementById('count-audit-18');
  const elCountMenores = document.getElementById('count-audit-menores');
  if (elBadgeTotal) elBadgeTotal.textContent = `${totalGeral} inscritos`;
  if (elCountTodos) elCountTodos.textContent = totalGeral;
  if (elCount18) elCount18.textContent = total18;
  if (elCountMenores) elCountMenores.textContent = totalMenores;

  // Estilos dos botões de filtro
  const btnTodos = document.getElementById('btn-filtro-audit-todos');
  const btn18 = document.getElementById('btn-filtro-audit-18');
  const btnMenores = document.getElementById('btn-filtro-audit-menores');
  [btnTodos, btn18, btnMenores].forEach(b => {
    if (b) {
      b.style.background = '#FFFFFF';
      b.style.color = 'var(--text-main)';
      b.style.borderColor = 'var(--border-color)';
      b.style.fontWeight = '600';
    }
  });

  let dadosFiltrados = listaCompleta;
  if (filtroAuditoriaAtivo === '18') {
    dadosFiltrados = listaCompleta.filter(p => p.idade === 18);
    if (btn18) {
      btn18.style.background = '#FEF3C7';
      btn18.style.color = '#92400E';
      btn18.style.borderColor = '#D97706';
      btn18.style.fontWeight = '700';
    }
  } else if (filtroAuditoriaAtivo === 'MENORES') {
    dadosFiltrados = listaCompleta.filter(p => p.idade < 18);
    if (btnMenores) {
      btnMenores.style.background = '#EDE9FE';
      btnMenores.style.color = '#6D28D9';
      btnMenores.style.borderColor = '#8B5CF6';
      btnMenores.style.fontWeight = '700';
    }
  } else {
    if (btnTodos) {
      btnTodos.style.background = '#FEF3C7';
      btnTodos.style.color = '#92400E';
      btnTodos.style.borderColor = '#D97706';
      btnTodos.style.fontWeight = '700';
    }
  }

  // Ordenar: primeiro os de 18 anos, depois por idade descrescente e nome
  dadosFiltrados.sort((a, b) => b.idade - a.idade || a.nome.localeCompare(b.nome));

  if (dadosFiltrados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">Nenhum participante encontrado neste filtro.</td></tr>`;
    return;
  }

  tbody.innerHTML = dadosFiltrados.map(p => {
    const is18 = p.idade === 18;
    const badgeFaixa = is18 ?
      `<span class="badge" style="background: #FEF3C7; color: #92400E; border: 1px solid #FCD34D; font-weight: 800; font-size: 0.725rem;">18 anos completos</span>` :
      `<span class="badge" style="background: #EDE9FE; color: #6D28D9; border: 1px solid #DDD6FE; font-weight: 700; font-size: 0.725rem;">Menor (${p.idade} anos)</span>`;

    const statusBadge = p.status === 'CONFIRMADA' ? 'badge-success' : p.status === 'PENDENTE' ? 'badge-warning' : 'badge-danger';

    // Formatar data dd/mm/aaaa
    let dtFmt = p.data_nascimento || '-';
    if (dtFmt.includes('-')) {
      const parts = dtFmt.split('T')[0].split('-');
      if (parts[0].length === 4) dtFmt = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    return `
      <tr style="border-bottom: 1px solid #F1F5F9; ${is18 ? 'background: #FFFBEB;' : ''}">
        <td style="padding: 0.6rem 0.85rem; font-weight: 700; color: var(--text-muted);">#${p.id}</td>
        <td style="padding: 0.6rem 0.85rem; font-weight: 700; color: var(--text-main);">
          ${p.nome}
          ${is18 ? `<span style="font-size: 0.72rem; color: #D97706; margin-left: 0.35rem; font-weight: 700;">[18 ANOS]</span>` : ''}
        </td>
        <td style="padding: 0.6rem 0.85rem; font-family: monospace; font-size: 0.82rem; color: #475569;">${dtFmt}</td>
        <td style="padding: 0.6rem 0.85rem;">
          <strong style="color: ${is18 ? '#D97706' : 'var(--text-main)'}; font-size: 0.95rem;">${p.idade} anos</strong>
        </td>
        <td style="padding: 0.6rem 0.85rem;">${badgeFaixa}</td>
        <td style="padding: 0.6rem 0.85rem; color: var(--text-muted); font-size: 0.8rem;">${p.igreja}</td>
        <td style="padding: 0.6rem 0.85rem; text-align: center;">
          <button class="btn btn-outline" style="padding: 0.25rem 0.55rem; font-size: 0.75rem;" onclick="abrirFichaParticipanteAuditoria(${p.id})" title="Ver Ficha Completa">
            Ver Ficha
          </button>
        </td>
      </tr>
    `;
  }).join('');
}



// ==========================================
// MÓDULO DE ACOMODAÇÕES & HOSPEDAGEM
// ==========================================
let cacheAcomodacoesData = null;
let alocarAcomodacaoAtual = null;
let alocarSelecionados = new Set();

function escAc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.carregarAcomodacoesEvento = async function() {
  if (!selectedEventoId) return;
  try {
    const data = await API.request(`/admin/eventos/${selectedEventoId}/acomodacoes`);
    cacheAcomodacoesData = data;

    const resumo = data.resumo || {};
    const setKpi = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val ?? 0;
    };
    setKpi('ac-kpi-total', resumo.total_acomodacoes);
    setKpi('ac-kpi-capacidade', resumo.capacidade_total);
    setKpi('ac-kpi-alocados', resumo.total_alocados);
    setKpi('ac-kpi-sem', resumo.total_sem_acomodacao);

    renderAcomodacoesUI();
    renderSemAcomodacaoLista();
  } catch (err) {
    console.error('Erro ao carregar acomodações:', err);
    const grid = document.getElementById('acomodacoes-cards-grid');
    if (grid) {
      grid.innerHTML = `<div class="card" style="padding: 2rem; text-align: center; color: #DC2626; grid-column: 1 / -1;">Erro ao carregar acomodações: ${escAc(err.message)}</div>`;
    }
  }
};

function renderAcomodacoesUI() {
  const grid = document.getElementById('acomodacoes-cards-grid');
  if (!grid || !cacheAcomodacoesData) return;

  const acomodacoes = cacheAcomodacoesData.acomodacoes || [];
  if (acomodacoes.length === 0) {
    grid.innerHTML = `
      <div class="card" style="padding: 2.5rem; text-align: center; color: var(--text-muted); grid-column: 1 / -1;">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 0.75rem auto; display: block; opacity: 0.6;"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>
        <p style="font-weight: 600; margin-bottom: 0.35rem;">Nenhuma acomodação cadastrada neste evento.</p>
        <p style="font-size: 0.85rem; margin-bottom: 1rem;">Crie quartos, alojamentos ou chalés para organizar a hospedagem dos participantes.</p>
        <button type="button" class="btn btn-primary" onclick="abrirModalAcomodacao()">Criar Primeira Acomodação</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = acomodacoes.map(ac => {
    const cap = Number(ac.capacidade || 0);
    const ocup = Number(ac.ocupados_count || 0);
    const pct = cap > 0 ? Math.min(100, Math.round((ocup / cap) * 100)) : 0;
    const lotado = cap > 0 && ocup >= cap;
    const barColor = lotado ? '#EF4444' : (pct >= 80 ? '#F59E0B' : '#10B981');

    let generoBadge = '';
    if (ac.genero_restrito === 'MASCULINO') {
      generoBadge = `<span class="badge" style="background: #EFF6FF; color: #1D4ED8;">Masculino</span>`;
    } else if (ac.genero_restrito === 'FEMININO') {
      generoBadge = `<span class="badge" style="background: #FDF2F8; color: #BE185D;">Feminino</span>`;
    } else if (ac.genero_restrito === 'MISTO') {
      generoBadge = `<span class="badge" style="background: #F0FDF4; color: #15803D;">Família / Misto</span>`;
    }

    const ocupantes = ac.ocupantes || [];
    const ocupantesHtml = ocupantes.length === 0
      ? `<div style="padding: 0.75rem; text-align: center; font-size: 0.8rem; color: var(--text-muted); background: #F8FAFC; border-radius: var(--radius-md);">Nenhum participante alocado.</div>`
      : `<div style="max-height: 210px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.4rem;">
          ${ocupantes.map(oc => {
            const tipoTag = oc.tipo === 'DIARIA'
              ? `<span style="font-size: 0.68rem; background: #EDE9FE; color: #6D28D9; padding: 1px 5px; border-radius: 4px; font-weight: 700;">Diária</span>`
              : '';
            const checkinTag = oc.checkin_realizado
              ? `<span style="font-size: 0.68rem; background: #DCFCE7; color: #15803D; padding: 1px 5px; border-radius: 4px; font-weight: 700;">Check-in</span>`
              : '';
            return `
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; padding: 0.45rem 0.6rem; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: var(--radius-md); font-size: 0.82rem;">
                <div style="min-width: 0; flex: 1;">
                  <div style="font-weight: 600; color: var(--text-dark); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escAc(oc.nome)} ${tipoTag} ${checkinTag}</div>
                  <div style="font-size: 0.72rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escAc(oc.igreja || 'Sem igreja')} ${oc.genero ? '• ' + escAc(oc.genero) : ''}</div>
                </div>
                <button type="button" class="btn btn-outline" title="Remover da acomodação" onclick="desalocarParticipanteAcomodacao('${oc.tipo}', ${oc.registro_id}, '${escAc(oc.nome)}')" style="padding: 0.2rem 0.45rem; font-size: 0.75rem; color: #DC2626; border-color: #FECACA; flex-shrink: 0;">Remover</button>
              </div>
            `;
          }).join('')}
        </div>`;

    return `
      <div class="card" style="padding: 1.25rem; display: flex; flex-direction: column; gap: 0.85rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
              <h3 style="font-size: 1.05rem; font-weight: 800; margin: 0;">${escAc(ac.nome)}</h3>
              <span class="badge" style="background: #F1F5F9; color: #334155;">${escAc(ac.tipo || 'Quarto')}</span>
              ${generoBadge}
            </div>
            ${ac.descricao ? `<p style="font-size: 0.78rem; color: var(--text-muted); margin: 0.25rem 0 0 0;">${escAc(ac.descricao)}</p>` : ''}
          </div>
          <div style="display: flex; gap: 0.35rem; flex-shrink: 0;">
            <button type="button" class="btn btn-outline" onclick="abrirModalAcomodacao(${ac.id})" style="padding: 0.3rem 0.55rem; font-size: 0.78rem;">Editar</button>
            <button type="button" class="btn btn-outline" onclick="excluirAcomodacao(${ac.id}, '${escAc(ac.nome)}')" style="padding: 0.3rem 0.55rem; font-size: 0.78rem; color: #DC2626; border-color: #FECACA;">Excluir</button>
          </div>
        </div>

        <div>
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 600; margin-bottom: 0.3rem;">
            <span>Ocupação: ${ocup} / ${cap > 0 ? cap : 'Ilimitado'}</span>
            <span style="color: ${lotado ? '#DC2626' : '#059669'};">${cap > 0 ? (lotado ? 'Lotado' : `${ac.vagas_restantes} vaga(s)`) : 'Aberta'}</span>
          </div>
          ${cap > 0 ? `
            <div style="width: 100%; height: 7px; background: #E2E8F0; border-radius: 999px; overflow: hidden;">
              <div style="width: ${pct}%; height: 100%; background: ${barColor}; transition: width 0.25s;"></div>
            </div>
          ` : ''}
        </div>

        ${ocupantesHtml}

        <button type="button" class="btn btn-primary" onclick="abrirModalAlocarAcomodacao(${ac.id})" style="width: 100%; margin-top: auto; font-size: 0.85rem;">
          Alocar Participantes
        </button>
      </div>
    `;
  }).join('');
}

window.renderSemAcomodacaoLista = function() {
  const container = document.getElementById('acomodacoes-sem-lista');
  if (!container || !cacheAcomodacoesData) return;

  const query = (document.getElementById('ac-sem-search')?.value || '').toLowerCase().trim();
  let lista = cacheAcomodacoesData.sem_acomodacao || [];
  if (query) {
    lista = lista.filter(p =>
      (p.nome || '').toLowerCase().includes(query) ||
      (p.igreja || '').toLowerCase().includes(query) ||
      (p.genero || '').toLowerCase().includes(query)
    );
  }

  if (lista.length === 0) {
    container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 1.5rem; margin: 0;">Todos os participantes ativos já possuem acomodação ou nenhum corresponde à busca.</p>`;
    return;
  }

  const acomodacoes = cacheAcomodacoesData.acomodacoes || [];
  const optionsHtml = acomodacoes.map(ac => `<option value="${ac.id}">${escAc(ac.nome)} (${ac.ocupados_count}/${ac.capacidade || '∞'})</option>`).join('');

  container.innerHTML = `
    <table style="width: 100%; font-size: 0.84rem; border-collapse: collapse;">
      <thead>
        <tr style="background: #F1F5F9; border-bottom: 1px solid var(--border-color);">
          <th style="padding: 0.65rem; text-align: left;">Participante</th>
          <th style="padding: 0.65rem; text-align: left;">Gênero</th>
          <th style="padding: 0.65rem; text-align: left;">Igreja</th>
          <th style="padding: 0.65rem; text-align: left;">Tipo / Status</th>
          <th style="padding: 0.65rem; text-align: right;">Alocação Rápida</th>
        </tr>
      </thead>
      <tbody>
        ${lista.map(p => `
          <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 0.65rem;">
              <div style="font-weight: 600;">${escAc(p.nome)}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${escAc(p.email)}</div>
            </td>
            <td style="padding: 0.65rem;">${escAc(p.genero || '-')}</td>
            <td style="padding: 0.65rem;">${escAc(p.igreja || '-')}</td>
            <td style="padding: 0.65rem;">
              <span class="badge" style="background: ${p.tipo === 'DIARIA' ? '#EDE9FE' : '#EFF6FF'}; color: ${p.tipo === 'DIARIA' ? '#6D28D9' : '#1D4ED8'};">${escAc(p.tipo_label)}</span>
              <span class="badge ${p.status === 'CONFIRMADA' ? 'badge-success' : 'badge-warning'}" style="margin-left: 0.25rem;">${escAc(p.status)}</span>
            </td>
            <td style="padding: 0.65rem; text-align: right;">
              ${acomodacoes.length > 0 ? `
                <select class="form-control" style="display: inline-block; width: auto; max-width: 210px; padding: 0.3rem 0.5rem; font-size: 0.8rem;" onchange="alocarRapidoParticipante(this.value, '${p.tipo}', ${p.registro_id})">
                  <option value="">Selecionar quarto...</option>
                  ${optionsHtml}
                </select>
              ` : `<span style="color: var(--text-muted); font-size: 0.78rem;">Crie uma acomodação</span>`}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
};

window.alocarRapidoParticipante = async function(acomodacaoId, tipo, registroId) {
  if (!acomodacaoId) return;
  try {
    const payload = {
      inscricao_ids: tipo === 'REGULAR' ? [registroId] : [],
      diaria_ids: tipo === 'DIARIA' ? [registroId] : []
    };
    await API.request(`/admin/eventos/${selectedEventoId}/acomodacoes/${acomodacaoId}/alocar`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    await carregarAcomodacoesEvento();
  } catch (err) {
    alert(err.message || 'Erro ao alocar participante.');
    await carregarAcomodacoesEvento();
  }
};

window.abrirModalAcomodacao = function(acomodacaoId = null) {
  const modal = document.getElementById('modal-acomodacao');
  const title = document.getElementById('modal-ac-title');
  const form = document.getElementById('form-acomodacao');
  if (!modal || !form) return;

  form.reset();
  document.getElementById('ac-edit-id').value = '';

  if (acomodacaoId && cacheAcomodacoesData) {
    const ac = (cacheAcomodacoesData.acomodacoes || []).find(a => a.id === acomodacaoId);
    if (ac) {
      title.textContent = 'Editar Acomodação';
      document.getElementById('ac-edit-id').value = ac.id;
      document.getElementById('ac-nome').value = ac.nome || '';
      document.getElementById('ac-tipo').value = ac.tipo || 'Quarto';
      document.getElementById('ac-capacidade').value = ac.capacidade ?? 10;
      document.getElementById('ac-genero').value = ac.genero_restrito || '';
      document.getElementById('ac-descricao').value = ac.descricao || '';
    }
  } else {
    title.textContent = 'Nova Acomodação';
    document.getElementById('ac-capacidade').value = 10;
  }

  modal.style.display = 'flex';
};

window.fecharModalAcomodacao = function() {
  const modal = document.getElementById('modal-acomodacao');
  if (modal) modal.style.display = 'none';
};

window.salvarAcomodacao = async function(e) {
  e.preventDefault();
  const editId = document.getElementById('ac-edit-id').value;
  const payload = {
    nome: document.getElementById('ac-nome').value.trim(),
    tipo: document.getElementById('ac-tipo').value,
    capacidade: parseInt(document.getElementById('ac-capacidade').value || '0', 10),
    genero_restrito: document.getElementById('ac-genero').value || null,
    descricao: document.getElementById('ac-descricao').value.trim() || null
  };

  try {
    if (editId) {
      await API.request(`/admin/eventos/${selectedEventoId}/acomodacoes/${editId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    } else {
      await API.request(`/admin/eventos/${selectedEventoId}/acomodacoes`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }
    fecharModalAcomodacao();
    await carregarAcomodacoesEvento();
  } catch (err) {
    alert(err.message || 'Erro ao salvar acomodação.');
  }
};

window.excluirAcomodacao = async function(acomodacaoId, nome) {
  if (!confirm(`Deseja excluir a acomodação "${nome}"? Os participantes alocados voltarão para a lista de espera.`)) return;
  try {
    await API.request(`/admin/eventos/${selectedEventoId}/acomodacoes/${acomodacaoId}`, {
      method: 'DELETE'
    });
    await carregarAcomodacoesEvento();
  } catch (err) {
    alert(err.message || 'Erro ao excluir acomodação.');
  }
};

window.abrirModalAlocarAcomodacao = function(acomodacaoId) {
  if (!cacheAcomodacoesData) return;
  const ac = (cacheAcomodacoesData.acomodacoes || []).find(a => a.id === acomodacaoId);
  if (!ac) return;

  alocarAcomodacaoAtual = ac;
  alocarSelecionados = new Set();

  document.getElementById('modal-alocar-title').textContent = `Alocar em: ${ac.nome}`;
  const vagasText = ac.capacidade > 0 ? `${ac.vagas_restantes} vaga(s) restante(s) de ${ac.capacidade}` : 'Capacidade ilimitada';
  document.getElementById('modal-alocar-subtitle').textContent = `${ac.tipo || 'Quarto'} • ${vagasText}`;

  const search = document.getElementById('alocar-search');
  if (search) search.value = '';
  const filtroGen = document.getElementById('alocar-filtro-genero');
  if (filtroGen) {
    filtroGen.value = ac.genero_restrito === 'MASCULINO' ? 'Masculino' : (ac.genero_restrito === 'FEMININO' ? 'Feminino' : '');
  }
  const filtroSt = document.getElementById('alocar-filtro-status');
  if (filtroSt) filtroSt.value = '';

  renderListaAlocacaoModal();
  const modalAlocar = document.getElementById('modal-alocar-acomodacao');
  if (modalAlocar) modalAlocar.style.display = 'flex';
};

window.fecharModalAlocarAcomodacao = function() {
  const modal = document.getElementById('modal-alocar-acomodacao');
  if (modal) modal.style.display = 'none';
  alocarAcomodacaoAtual = null;
  alocarSelecionados.clear();
};

window.renderListaAlocacaoModal = function() {
  const container = document.getElementById('alocar-lista-container');
  const countEl = document.getElementById('alocar-selecionados-count');
  if (!container || !cacheAcomodacoesData) return;

  const q = (document.getElementById('alocar-search')?.value || '').toLowerCase().trim();
  const gen = (document.getElementById('alocar-filtro-genero')?.value || '').toLowerCase();
  const st = document.getElementById('alocar-filtro-status')?.value || '';

  let lista = cacheAcomodacoesData.sem_acomodacao || [];
  if (q) {
    lista = lista.filter(p =>
      (p.nome || '').toLowerCase().includes(q) ||
      (p.igreja || '').toLowerCase().includes(q)
    );
  }
  if (gen) {
    lista = lista.filter(p => (p.genero || '').toLowerCase().includes(gen));
  }
  if (st) {
    lista = lista.filter(p => p.status === st);
  }

  if (countEl) countEl.textContent = `${alocarSelecionados.size} selecionado(s)`;

  if (lista.length === 0) {
    container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 1.5rem; margin: 0;">Nenhum participante disponível com os filtros atuais.</p>`;
    return;
  }

  container.innerHTML = lista.map(p => {
    const key = `${p.tipo}:${p.registro_id}`;
    const checked = alocarSelecionados.has(key) ? 'checked' : '';
    return `
      <label style="display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 0.75rem; border-bottom: 1px solid #F1F5F9; cursor: pointer;">
        <input type="checkbox" ${checked} onchange="toggleSelecaoAlocacao('${key}')" style="width: 17px; height: 17px; accent-color: var(--primary);">
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; font-size: 0.88rem;">${escAc(p.nome)}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${escAc(p.igreja || 'Sem igreja')} • ${escAc(p.genero || 'N/I')} • ${escAc(p.tipo_label)}</div>
        </div>
        <span class="badge ${p.status === 'CONFIRMADA' ? 'badge-success' : 'badge-warning'}">${escAc(p.status)}</span>
      </label>
    `;
  }).join('');
};

window.toggleSelecaoAlocacao = function(key) {
  if (alocarSelecionados.has(key)) alocarSelecionados.delete(key);
  else alocarSelecionados.add(key);
  const countEl = document.getElementById('alocar-selecionados-count');
  if (countEl) countEl.textContent = `${alocarSelecionados.size} selecionado(s)`;
};

window.confirmarAlocacaoAcomodacao = async function() {
  if (!alocarAcomodacaoAtual) return;
  if (alocarSelecionados.size === 0) {
    alert('Selecione pelo menos um participante para alocar.');
    return;
  }

  const inscricao_ids = [];
  const diaria_ids = [];
  alocarSelecionados.forEach(key => {
    const [tipo, idStr] = key.split(':');
    const id = parseInt(idStr, 10);
    if (tipo === 'DIARIA') diaria_ids.push(id);
    else inscricao_ids.push(id);
  });

  try {
    await API.request(`/admin/eventos/${selectedEventoId}/acomodacoes/${alocarAcomodacaoAtual.id}/alocar`, {
      method: 'POST',
      body: JSON.stringify({ inscricao_ids, diaria_ids })
    });
    fecharModalAlocarAcomodacao();
    await carregarAcomodacoesEvento();
  } catch (err) {
    alert(err.message || 'Erro ao alocar participantes.');
  }
};

window.desalocarParticipanteAcomodacao = async function(tipo, registroId, nome) {
  if (!confirm(`Remover "${nome}" desta acomodação?`)) return;
  try {
    await API.request(`/admin/eventos/${selectedEventoId}/acomodacoes/desalocar`, {
      method: 'POST',
      body: JSON.stringify({ tipo, registro_id: registroId })
    });
    await carregarAcomodacoesEvento();
  } catch (err) {
    alert(err.message || 'Erro ao remover participante.');
  }
};

window.imprimirAcomodacoes = function() {
  if (!cacheAcomodacoesData) return;
  const acomodacoes = cacheAcomodacoesData.acomodacoes || [];
  const tituloEvento = eventoAtual ? eventoAtual.titulo : 'Evento';
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    alert('Permita pop-ups para imprimir a lista de acomodações.');
    return;
  }

  const roomsHtml = acomodacoes.map(ac => {
    const ocupantes = ac.ocupantes || [];
    const rows = ocupantes.length > 0
      ? ocupantes.map((oc, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td>${escAc(oc.nome)}</td>
            <td>${escAc(oc.igreja || '-')}</td>
            <td>${escAc(oc.genero || '-')}</td>
            <td>${oc.tipo === 'DIARIA' ? 'Diária' : 'Integral'}</td>
          </tr>`).join('')
      : `<tr><td colspan="5" style="color: #64748b; text-align: center;">Sem participantes alocados</td></tr>`;

    return `
      <div class="room-box">
        <h3>${escAc(ac.nome)} <small>(${escAc(ac.tipo || 'Quarto')} — ${ocupantes.length}/${ac.capacidade || '∞'})</small></h3>
        ${ac.descricao ? `<p class="desc">${escAc(ac.descricao)}</p>` : ''}
        <table>
          <thead><tr><th style="width:36px;">#</th><th>Nome</th><th>Igreja</th><th>Gênero</th><th>Modalidade</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }).join('');

  win.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Acomodações - ${escAc(tituloEvento)}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .sub { color: #475569; font-size: 13px; margin-bottom: 20px; }
        .room-box { margin-bottom: 22px; page-break-inside: avoid; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; }
        .room-box h3 { margin: 0 0 6px 0; font-size: 15px; }
        .room-box h3 small { font-weight: normal; color: #475569; }
        .desc { font-size: 12px; color: #475569; margin: 0 0 8px 0; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
        th { background: #f1f5f9; }
      </style>
    </head>
    <body>
      <h1>Lista de Acomodações — ${escAc(tituloEvento)}</h1>
      <div class="sub">Gerado em ${new Date().toLocaleString('pt-BR')}</div>
      ${roomsHtml || '<p>Nenhuma acomodação cadastrada.</p>'}
      <script>window.onload = function() { window.print(); };</script>
    </body>
    </html>
  `);
  win.document.close();
};
