document.addEventListener('DOMContentLoaded', async () => {
  const token = API.getToken();
  let user = API.getUser();

  // Se não estiver logado ou não for administrador, solicitar login admin
  if (!token || !user || !user.is_admin) {
    const path = window.location.pathname;
    const isIndex = path.endsWith('index.html') || path === '/' || path.endsWith('/');
    if (!isIndex) {
      window.location.href = 'index.html';
      return;
    }
    promptAdminLogin();
    return;
  }

  // 1. Aplicar restrições de imediato com o dado em cache
  if (user && user.perfil_acesso) {
    aplicarRestricoesPerfilAdmin(user);
  }

  // 2. Sincronizar OBRIGATORIAMENTE com o servidor (/auth/me) para atualizar perfil_acesso do banco de dados
  try {
    const me = await API.request('/auth/me');
    if (me && me.is_admin) {
      API.setUser(me);
      user = me;
      aplicarRestricoesPerfilAdmin(user);
    }
  } catch (err) {
    console.warn('Não foi possível sincronizar perfil do usuário com o servidor:', err);
    if (user) {
      aplicarRestricoesPerfilAdmin(user);
    }
  }

  // Identificar página atual
  if (document.getElementById('admin-dashboard')) {
    initDashboard();
  } else if (document.getElementById('admin-inscricoes')) {
    initInscricoes();
  } else if (document.getElementById('admin-pagamentos')) {
    initPagamentos();
  } else if (document.getElementById('admin-configuracoes')) {
    initConfiguracoes();
  } else if (document.getElementById('admin-gincana')) {
    initGincana();
  }
});

function promptAdminLogin() {
  const modal = document.getElementById('login-modal');
  if (modal) {
    modal.style.display = 'flex';
    const form = document.getElementById('admin-login-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('admin-email').value;
      const senha = document.getElementById('admin-senha').value;

      const submitBtn = document.getElementById('admin-login-submit-btn');
      const errorDiv = document.getElementById('admin-login-error');

      // Reset state
      if (errorDiv) {
        errorDiv.style.display = 'none';
        errorDiv.textContent = '';
      }

      let originalText = 'Entrar no Painel';
      if (submitBtn) {
        originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = `<span class="spinner" style="display:inline-block; width: 16px; height: 16px; border: 2px solid white; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 0.5rem;"></span> Entrando...`;
        submitBtn.disabled = true;
      }

      try {
        const res = await API.request('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, senha })
        });

        if (!res.user.is_admin) {
          throw new Error('Usuário não possui privilégios de administrador.');
        }

        API.setToken(res.access_token);
        API.setUser(res.user);
        modal.style.display = 'none';

        const perfil = (res.user.perfil_acesso || 'global').toLowerCase().trim();
        if (perfil === 'gincana') {
          window.location.href = 'gincana.html';
        } else {
          window.location.reload();
        }
      } catch (err) {
        if (errorDiv) {
          errorDiv.textContent = err.message || 'Credenciais de admin inválidas. Por favor, tente novamente.';
          errorDiv.style.display = 'block';
        }
        if (submitBtn) {
          submitBtn.innerHTML = originalText;
          submitBtn.disabled = false;
        }
      }
    });
  }
}

function logoutAdmin() {
  API.removeToken();
  window.location.href = 'index.html';
}

// --- Dashboard & Event CRUD ---
async function initDashboard() {
  try {
    const metrics = await API.request('/admin/metrics');
    document.getElementById('m-eventos').textContent = metrics.total_eventos;
    document.getElementById('m-eventos-ativos').textContent = metrics.total_eventos_ativos;
    document.getElementById('m-eventos-inativos').textContent = metrics.total_eventos_inativos;
    document.getElementById('m-media-participantes').textContent = metrics.media_participantes.toFixed(2).replace('.', ',');

    loadEventosTable();
  } catch (err) {}
}

async function loadEventosTable() {
  const cardsContainer = document.getElementById('eventos-cards-container');
  if (!cardsContainer) return;
  try {
    const eventos = await API.request('/admin/eventos');
    if (eventos.length === 0) {
      cardsContainer.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 3rem 0;">Nenhum evento cadastrado no sistema.</p>`;
      return;
    }
    cardsContainer.innerHTML = eventos.map(ev => {
      const bannerUrl = ev.fotos ? ev.fotos.split(',')[0].trim() : '';
      return `
        <div class="card" style="padding:0; overflow:hidden; border: 1px solid var(--border-color); display:flex; flex-direction:column; justify-content:space-between; cursor:pointer; transition: transform 0.2s, box-shadow 0.2s;" onclick="location.href='gerenciar-evento.html?evento_id=${ev.id}'" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='var(--shadow-md)';" onmouseout="this.style.transform='none'; this.style.boxShadow='var(--shadow-sm)';">
          <!-- Imagem de Banner do Evento -->
          <div style="height: 160px; background: #EFF6FF; position: relative; overflow:hidden;">
            <img src="${bannerUrl}" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none';">
            <span class="badge ${ev.ativo ? 'badge-success' : 'badge-danger'}" style="position: absolute; top: 10px; right: 10px; font-size: 0.75rem;">
              ${ev.ativo ? 'Ativo' : 'Inativo'}
            </span>
          </div>
          
          <!-- Detalhes do Evento -->
          <div style="padding: 1.5rem; flex-grow:1; display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <h3 style="font-size: 1.25rem; font-weight: 800; margin-bottom: 0.5rem; color: var(--dark); line-height: 1.3;">
                ${ev.titulo}
              </h3>
              <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem; line-height: 1.5;">
                📍 Local: ${ev.local || 'A definir'}<br>
                📅 Início: ${new Date(ev.data_inicio).toLocaleDateString('pt-BR')}<br>
                👥 Vagas: ${ev.max_participantes ? `${ev.vagas_restantes !== null ? ev.vagas_restantes : ev.max_participantes} / ${ev.max_participantes}` : 'Ilimitadas'}
              </p>
            </div>
            
            <div style="display:flex; justify-content:space-between; align-items:center; border-top: 1px solid var(--border-color); padding-top: 1rem; margin-top: auto;">
              <span style="font-size: 1.15rem; font-weight: 800; color: var(--primary);">
                R$ ${parseFloat(ev.valor).toFixed(2).replace('.', ',')}
              </span>
              <span style="font-size: 0.85rem; font-weight: 700; color: var(--primary); display: flex; align-items: center; gap: 0.25rem;">
                Gerenciar &rarr;
              </span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {}
}

function abrirModalEvento() {
  document.getElementById('form-evento').reset();
  document.getElementById('modal-evento-title').textContent = 'Novo Evento';
  document.getElementById('evento-modal').style.display = 'flex';
}

function fecharModalEvento() {
  document.getElementById('evento-modal').style.display = 'none';
}

async function salvarEvento(e) {
  e.preventDefault();
  const payload = {
    titulo: document.getElementById('ev-titulo').value.trim()
  };

  try {
    const res = await API.request('/admin/eventos', { method: 'POST', body: JSON.stringify(payload) });
    showToast('Evento criado com sucesso! Direcionando para configurações...', 'success');
    fecharModalEvento();
    setTimeout(() => {
      window.location.href = `gerenciar-evento.html?evento_id=${res.id}`;
    }, 1000);
  } catch (err) {
    showToast('Erro ao criar evento.', 'error');
  }
}

window.editarEvento = async function(id) {
  try {
    const ev = await API.request(`/eventos/publico/${id}`);
    document.getElementById('evento-id').value = ev.id;
    document.getElementById('ev-titulo').value = ev.titulo;
    document.getElementById('ev-descricao').value = ev.descricao || '';
    
    const formatDt = (isoStr) => isoStr ? isoStr.substring(0, 16) : '';
    document.getElementById('ev-inicio').value = formatDt(ev.data_inicio);
    document.getElementById('ev-fim').value = formatDt(ev.data_fim);
    
    document.getElementById('ev-local').value = ev.local || '';
    document.getElementById('ev-valor').value = ev.valor;
    document.getElementById('ev-max-part').value = ev.max_participantes || '';
    document.getElementById('ev-ativo').checked = ev.ativo;

    document.querySelectorAll('.ev-form-field').forEach(cb => {
      cb.checked = ev.campos_formulario ? ev.campos_formulario.split(',').includes(cb.value) : false;
    });

    const fotosArray = ev.fotos ? ev.fotos.split(',') : [];
    document.getElementById('ev-foto-1').value = fotosArray[0] || '';
    document.getElementById('ev-foto-2').value = fotosArray[1] || '';
    document.getElementById('ev-foto-3').value = fotosArray[2] || '';
    document.getElementById('ev-foto-4').value = fotosArray[3] || '';

    document.getElementById('modal-evento-title').textContent = 'Editar Evento';
    document.getElementById('evento-modal').style.display = 'flex';
  } catch (err) {
    showToast('Erro ao carregar detalhes do evento.', 'error');
  }
};

async function toggleStatusEvento(id) {
  try {
    await API.request(`/admin/eventos/${id}/toggle-status`, { method: 'PUT' });
    showToast('Status do evento alterado!', 'success');
    loadEventosTable();
  } catch (err) {}
}

async function deletarEvento(id) {
  if (confirm('Tem certeza que deseja excluir este evento?')) {
    try {
      await API.request(`/admin/eventos/${id}`, { method: 'DELETE' });
      showToast('Evento excluído!', 'success');
      loadEventosTable();
    } catch (err) {}
  }
}

// --- Gerenciamento de Inscrições ---
let cachedInscricoesList = [];
let allEventsList = [];

async function initInscricoes() {
  const filterEventoSelect = document.getElementById('filter-evento');
  if (filterEventoSelect) {
    try {
      const eventos = await API.request('/admin/eventos');
      allEventsList = eventos;
      filterEventoSelect.innerHTML = '<option value="">Todos os Eventos</option>' + 
        eventos.map(ev => `<option value="${ev.id}">${ev.titulo}</option>`).join('');
      
      const urlParams = new URLSearchParams(window.location.search);
      const queryEventoId = urlParams.get('evento_id');
      if (queryEventoId) {
        filterEventoSelect.value = queryEventoId;
      }
    } catch (err) {
      console.error("Erro ao carregar lista de eventos para filtro:", err);
    }
  }
  loadInscricoes();
}

window.onEventoFilterChange = function() {
  loadInscricoes();
};

async function loadInscricoes() {
  const container = document.getElementById('inscricoes-table-body');
  const tableHead = document.getElementById('inscricoes-table-head');
  if (!container) return;

  const status = document.getElementById('filter-status')?.value || '';
  const search = document.getElementById('filter-search')?.value || '';
  const eventoId = document.getElementById('filter-evento')?.value || '';
  const igreja = document.getElementById('filter-igreja')?.value || '';

  let queryStr = `?page=1&limit=200`;
  if (status) queryStr += `&status_filtro=${status}`;
  if (search) queryStr += `&search=${encodeURIComponent(search)}`;
  if (eventoId) queryStr += `&evento_id=${eventoId}`;
  if (igreja) queryStr += `&igreja=${encodeURIComponent(igreja)}`;

  try {
    const data = await API.request(`/admin/inscricoes${queryStr}`);
    cachedInscricoesList = data;

    // Descobrir quais campos extras o evento atual exige
    let customFields = [];
    if (eventoId) {
      const selectedEvent = allEventsList.find(e => e.id == eventoId);
      if (selectedEvent && selectedEvent.campos_formulario) {
        customFields = selectedEvent.campos_formulario.split(',').filter(f => f.trim() !== '');
      }
    }

    // 1. Atualizar cabeçalhos (tableHead)
    let headHTML = `
      <tr>
        <th>ID</th>
        <th>Participante</th>
        ${!eventoId ? '<th>Evento</th>' : ''}
        <th>Forma Pag.</th>
        <th>Valor Total</th>
        <th>Status</th>
    `;
    // Adicionar colunas para cada campo customizado
    customFields.forEach(f => {
      headHTML += `<th>${formatarLabelCampo(f)}</th>`;
    });
    headHTML += `
        <th>Ações Manuais</th>
      </tr>
    `;
    if (tableHead) tableHead.innerHTML = headHTML;

    // 2. Preencher linhas (tbody)
    container.innerHTML = data.map(ins => {
      const firstPag = ins.pagamentos && ins.pagamentos[0];
      const captureMethod = firstPag ? firstPag.capture_method : null;
      const user = ins.usuario || {};
      
      let rowHTML = `
        <tr>
          <td>#${ins.id}</td>
          <td><strong>${user.nome || 'N/A'}</strong><br><small style="color:var(--text-muted);">${user.email || ''}</small></td>
          ${!eventoId ? `<td>${ins.evento ? ins.evento.titulo : 'N/A'}</td>` : ''}
          <td>${formatarFormaPagamento(ins.forma_pagamento, captureMethod)}</td>
          <td>R$ ${parseFloat(ins.valor_total).toFixed(2).replace('.', ',')}</td>
          <td><span class="badge ${ins.status === 'CONFIRMADA' ? 'badge-success' : ins.status === 'PENDENTE' ? 'badge-warning' : 'badge-danger'}">${ins.status}</span></td>
      `;

      // Renderizar valores dos campos customizados salvos em dados_extras
      const extras = ins.dados_extras || {};
      customFields.forEach(f => {
        let val = extras[f] || '-';
        if (f === 'data_nascimento' && val !== '-') {
          val = new Date(val + 'T00:00:00').toLocaleDateString('pt-BR');
        }
        rowHTML += `<td>${val}</td>`;
      });

      rowHTML += `
          <td>
            ${ins.status !== 'CONFIRMADA' ? `<button class="btn btn-success" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="alterarStatusInscricao(${ins.id}, 'CONFIRMADA')">Confirmar</button>` : ''}
            ${ins.status !== 'CANCELADA' ? `<button class="btn btn-danger" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="alterarStatusInscricao(${ins.id}, 'CANCELADA')">Cancelar</button>` : ''}
          </td>
        </tr>
      `;
      return rowHTML;
    }).join('');
  } catch (err) {}
}

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

window.exportarCSV = function() {
  if (cachedInscricoesList.length === 0) {
    showToast("Nenhuma inscrição para exportar.", "warning");
    return;
  }

  const eventoId = document.getElementById('filter-evento').value;
  let customFields = [];
  if (eventoId) {
    const selectedEvent = allEventsList.find(e => e.id == eventoId);
    if (selectedEvent && selectedEvent.campos_formulario) {
      customFields = selectedEvent.campos_formulario.split(',').filter(f => f.trim() !== '');
    }
  }

  let headers = ["ID", "Nome", "E-mail", "Status", "Forma Pagamento", "Valor Total"];
  customFields.forEach(f => {
    headers.push(formatarLabelCampo(f));
  });

  const rows = cachedInscricoesList.map(ins => {
    const row = [
      ins.id,
      ins.usuario ? ins.usuario.nome : 'N/A',
      ins.usuario ? ins.usuario.email : 'N/A',
      ins.status,
      ins.forma_pagamento || 'N/A',
      parseFloat(ins.valor_total).toFixed(2)
    ];

    const extras = ins.dados_extras || {};
    customFields.forEach(f => {
      let val = extras[f] || '';
      row.push(val);
    });

    return row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(';');
  });

  const csvContent = "\ufeff" + [headers.join(';'), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `relatorio_inscricoes_evento_${eventoId || 'geral'}.csv`);
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
  const eventoId = document.getElementById('filter-evento').value;
  const eventName = eventoId ? allEventsList.find(e => e.id == eventoId).titulo : 'Todos os Eventos';

  let html = `
    <html>
      <head>
        <title>Relatório de Inscrições - ${eventName}</title>
        <style>
          body { font-family: sans-serif; padding: 20px; color: #1e293b; }
          h1 { font-size: 20px; border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
          th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
          th { background-color: #f8fafc; font-weight: bold; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .badge { padding: 3px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; }
          .badge-success { background: #d1fae5; color: #065f46; }
          .badge-warning { background: #fef3c7; color: #78350f; }
          .badge-danger { background: #fee2e2; color: #991b1b; }
        </style>
      </head>
      <body>
        <h1>Relatório de Inscrições: ${eventName}</h1>
        <p>Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
        <table>
          <thead>
            ${document.getElementById('inscricoes-table-head').innerHTML}
          </thead>
          <tbody>
  `;

  const rowsHtml = cachedInscricoesList.map(ins => {
    const user = ins.usuario || {};
    const statusClass = ins.status === 'CONFIRMADA' ? 'badge-success' : ins.status === 'PENDENTE' ? 'badge-warning' : 'badge-danger';
    
    let cols = `
      <td>#${ins.id}</td>
      <td><strong>${user.nome || 'N/A'}</strong><br>${user.email || ''}</td>
      ${!eventoId ? `<td>${ins.evento ? ins.evento.titulo : 'N/A'}</td>` : ''}
      <td>${ins.forma_pagamento || 'N/A'}</td>
      <td>R$ ${parseFloat(ins.valor_total).toFixed(2).replace('.', ',')}</td>
      <td><span class="badge ${statusClass}">${ins.status}</span></td>
    `;

    const extras = ins.dados_extras || {};
    let customFields = [];
    if (eventoId) {
      const selectedEvent = allEventsList.find(e => e.id == eventoId);
      if (selectedEvent && selectedEvent.campos_formulario) {
        customFields = selectedEvent.campos_formulario.split(',').filter(f => f.trim() !== '');
      }
    }

    customFields.forEach(f => {
      let val = extras[f] || '-';
      if (f === 'data_nascimento' && val !== '-') {
        val = new Date(val + 'T00:00:00').toLocaleDateString('pt-BR');
      }
      cols += `<td>${val}</td>`;
    });

    return `<tr>${cols}<td>-</td></tr>`;
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

async function alterarStatusInscricao(id, novoStatus) {
  try {
    await API.request(`/admin/inscricoes/${id}/status?novo_status=${novoStatus}`, { method: 'PUT' });
    showToast(`Inscrição #${id} atualizada para ${novoStatus}!`, 'success');
    loadInscricoes();
  } catch (err) {}
}

// --- Gerenciamento de Pagamentos ---
let selectedPaymentEventoId = null;

async function initPagamentos() {
  const urlParams = new URLSearchParams(window.location.search);
  selectedPaymentEventoId = urlParams.get('evento_id');
  loadPagamentos();
}

async function loadPagamentos() {
  const container = document.getElementById('pagamentos-table-body');
  if (!container) return;

  try {
    let url = '/admin/pagamentos';
    if (selectedPaymentEventoId) {
      url += `?evento_id=${selectedPaymentEventoId}`;
    }
    const pagamentos = await API.request(url);
    
    let rowsHtml = '';
    pagamentos.forEach(pag => {
      if (pag.parcelas && pag.parcelas.length > 0) {
        pag.parcelas.forEach(parc => {
          rowsHtml += `
            <tr>
              <td>Pag #${pag.id} (Parc ${parc.numero})</td>
              <td>Inscrição #${pag.inscricao_id}</td>
              <td>${formatarFormaPagamento(pag.forma_pagamento, pag.capture_method)}</td>
              <td>R$ ${parseFloat(parc.valor).toFixed(2).replace('.', ',')}</td>
              <td>${new Date(parc.vencimento + (parc.vencimento.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('pt-BR')}</td>
              <td><span class="badge ${parc.status === 'PAGO' ? 'badge-success' : 'badge-warning'}">${parc.status}</span></td>
              <td>
                ${parc.status !== 'PAGO' ? `<button class="btn btn-success" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="alterarStatusParcela(${parc.id}, 'PAGO')">Dar Baixa (Pago)</button>` : '<span style="color:#059669;">Quitada</span>'}
              </td>
            </tr>
          `;
        });
      } else {
        rowsHtml += `
          <tr>
            <td>Pag #${pag.id}</td>
            <td>Inscrição #${pag.inscricao_id}</td>
            <td>${formatarFormaPagamento(pag.forma_pagamento, pag.capture_method)}</td>
            <td>R$ ${parseFloat(pag.valor).toFixed(2).replace('.', ',')}</td>
            <td>N/A</td>
            <td><span class="badge ${pag.status === 'PAGO' ? 'badge-success' : 'badge-warning'}">${pag.status}</span></td>
            <td>-</td>
          </tr>
        `;
      }
    });

    container.innerHTML = rowsHtml;

  } catch (err) {}
}

async function alterarStatusParcela(id, novoStatus) {
  try {
    await API.request(`/admin/parcelas/${id}/status?novo_status=${novoStatus}`, { method: 'PUT' });
    showToast(`Parcela #${id} atualizada para ${novoStatus}!`, 'success');
    loadPagamentos();
  } catch (err) {}
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

async function initConfiguracoes() {
  try {
    const data = await API.request('/admin/configuracoes');
    if (document.getElementById('config-infinitepay-handle')) {
      document.getElementById('config-infinitepay-handle').value = data.infinitepay_handle || '';
    }
    if (document.getElementById('config-pix-chave')) {
      document.getElementById('config-pix-chave').value = data.pix_chave || '';
    }
    if (document.getElementById('config-pix-nome')) {
      document.getElementById('config-pix-nome').value = data.pix_nome_recebedor || '';
    }
    if (document.getElementById('config-pix-cidade')) {
      document.getElementById('config-pix-cidade').value = data.pix_cidade_recebedor || '';
    }
  } catch (err) {
    showToast('Erro ao carregar configurações do sistema.', 'error');
  }
  loadPresbiterios();
  loadIgrejas();
  loadAdministradores();
}

async function salvarConfiguracoes(e) {
  e.preventDefault();
  const payload = {
    infinitepay_handle: document.getElementById('config-infinitepay-handle').value.trim()
  };
  const elChave = document.getElementById('config-pix-chave');
  if (elChave) payload.pix_chave = elChave.value.trim();
  const elNome = document.getElementById('config-pix-nome');
  if (elNome) payload.pix_nome_recebedor = elNome.value.trim();
  const elCidade = document.getElementById('config-pix-cidade');
  if (elCidade) payload.pix_cidade_recebedor = elCidade.value.trim();

  try {
    await API.request('/admin/configuracoes', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    showToast('Configurações salvas com sucesso!', 'success');
  } catch (err) {
    showToast('Erro ao salvar as configurações.', 'error');
  }
}

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
    showToast('Imagem enviada com sucesso para o Supabase Storage!', 'success');
  } catch (err) {
    showToast(err.message || 'Erro ao enviar imagem.', 'error');
  } finally {
    label.innerHTML = originalText;
    label.style.pointerEvents = 'auto';
    inputElement.value = '';
  }
};

// --- Gerenciamento de Presbitérios ---
let cachedPresbiterios = [];

async function loadPresbiterios() {
  const container = document.getElementById('presbiterios-table-body');
  if (!container) return;

  try {
    const data = await API.request('/presbiterios');
    cachedPresbiterios = data;
    atualizarSelectsPresbiterioParaIgrejas();
    if (data.length === 0) {
      container.innerHTML = `<tr><td colspan="2" style="text-align: center; color: var(--text-muted); padding: 1.5rem 0;">Nenhum presbitério cadastrado.</td></tr>`;
      return;
    }

    container.innerHTML = data.map(p => `
      <tr>
        <td><strong>${p.nome}</strong></td>
        <td style="text-align: right;">
          <button class="btn btn-outline" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick="editarPresbiterio(${p.id}, '${p.nome}')">✏️ Editar</button>
          <button class="btn btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick="deletarPresbiterio(${p.id})">❌ Excluir</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    container.innerHTML = `<tr><td colspan="2" style="text-align: center; color: var(--text-danger);">Erro ao carregar presbitérios.</td></tr>`;
  }
}

window.editarPresbiterio = function(id, nome) {
  document.getElementById('presbiterio-id').value = id;
  document.getElementById('presbiterio-nome').value = nome;
  document.getElementById('btn-salvar-presbiterio').textContent = 'Salvar';
  document.getElementById('btn-cancelar-presbiterio').style.display = 'inline-block';
};

window.resetFormPresbiterio = function() {
  document.getElementById('presbiterio-id').value = '';
  document.getElementById('presbiterio-nome').value = '';
  document.getElementById('btn-salvar-presbiterio').textContent = 'Adicionar';
  document.getElementById('btn-cancelar-presbiterio').style.display = 'none';
};

window.salvarPresbiterio = async function(e) {
  e.preventDefault();
  const id = document.getElementById('presbiterio-id').value;
  const nome = document.getElementById('presbiterio-nome').value.trim();

  try {
    if (id) {
      await API.request(`/admin/presbiterios/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ nome })
      });
      showToast('Presbitério atualizado com sucesso!', 'success');
    } else {
      await API.request('/admin/presbiterios', {
        method: 'POST',
        body: JSON.stringify({ nome })
      });
      showToast('Presbitério adicionado com sucesso!', 'success');
    }
    resetFormPresbiterio();
    loadPresbiterios();
  } catch (err) {
    showToast(err.message || 'Erro ao salvar presbitério.', 'error');
  }
};

window.deletarPresbiterio = async function(id) {
  if (confirm('Deseja realmente excluir este presbitério?')) {
    try {
      await API.request(`/admin/presbiterios/${id}`, {
        method: 'DELETE'
      });
      showToast('Presbitério excluído!', 'success');
      loadPresbiterios();
      loadIgrejas();
    } catch (err) {
      showToast('Erro ao excluir presbitério.', 'error');
    }
  }
};

// --- Gerenciamento de Igrejas ---
let cachedIgrejas = [];

function atualizarSelectsPresbiterioParaIgrejas() {
  const selectForm = document.getElementById('igreja-presbiterio-id');
  const selectFiltro = document.getElementById('filtro-igreja-presbiterio');

  if (selectForm && cachedPresbiterios) {
    const valAtual = selectForm.value;
    selectForm.innerHTML = '<option value="">Selecione o presbitério...</option>' + 
      cachedPresbiterios.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
    if (valAtual) selectForm.value = valAtual;
  }

  if (selectFiltro && cachedPresbiterios) {
    const valAtual = selectFiltro.value;
    selectFiltro.innerHTML = '<option value="">Todos os Presbitérios</option>' + 
      cachedPresbiterios.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
    if (valAtual) selectFiltro.value = valAtual;
  }
}

async function loadIgrejas() {
  const container = document.getElementById('igrejas-table-body');
  if (!container) return;

  try {
    const data = await API.request('/igrejas');
    cachedIgrejas = data;
    atualizarSelectsPresbiterioParaIgrejas();
    filtrarIgrejasAdmin();
  } catch (err) {
    container.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-danger); padding: 1.5rem;">Erro ao carregar igrejas.</td></tr>`;
  }
}

window.filtrarIgrejasAdmin = function() {
  const container = document.getElementById('igrejas-table-body');
  const badgeTotal = document.getElementById('badge-total-igrejas');
  if (!container) return;

  const termo = (document.getElementById('filtro-igreja-busca')?.value || '').toLowerCase().trim();
  const presbId = document.getElementById('filtro-igreja-presbiterio')?.value || '';

  const filtradas = cachedIgrejas.filter(i => {
    const matchNome = !termo || i.nome.toLowerCase().includes(termo);
    const matchPresb = !presbId || String(i.presbiterio_id) === String(presbId);
    return matchNome && matchPresb;
  });

  if (badgeTotal) {
    badgeTotal.textContent = `${filtradas.length} de ${cachedIgrejas.length} igrejas`;
  }

  if (filtradas.length === 0) {
    container.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Nenhuma igreja encontrada com os filtros aplicados.</td></tr>`;
    return;
  }

  container.innerHTML = filtradas.map(i => {
    const presbNome = i.presbiterio ? i.presbiterio.nome : 'Presbitério não identificado';
    const escapedNome = (i.nome || '').replace(/'/g, "\\'");
    return `
      <tr>
        <td><strong>${i.nome}</strong></td>
        <td><span class="badge" style="background: var(--primary-light, #EEF2FF); color: var(--primary, #4F46E5); font-weight: 500;">${presbNome}</span></td>
        <td style="text-align: right;">
          <button class="btn btn-outline" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick="editarIgreja(${i.id}, '${escapedNome}', ${i.presbiterio_id})">✏️ Editar</button>
          <button class="btn btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick="deletarIgreja(${i.id})">❌ Excluir</button>
        </td>
      </tr>
    `;
  }).join('');
};

window.editarIgreja = function(id, nome, presbiterioId) {
  document.getElementById('igreja-id').value = id;
  document.getElementById('igreja-nome').value = nome;
  document.getElementById('igreja-presbiterio-id').value = presbiterioId;
  document.getElementById('btn-salvar-igreja').textContent = 'Salvar';
  document.getElementById('btn-cancelar-igreja').style.display = 'inline-block';
  document.getElementById('form-igreja').scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.resetFormIgreja = function() {
  document.getElementById('igreja-id').value = '';
  document.getElementById('igreja-nome').value = '';
  document.getElementById('igreja-presbiterio-id').value = '';
  document.getElementById('btn-salvar-igreja').textContent = 'Adicionar';
  document.getElementById('btn-cancelar-igreja').style.display = 'none';
};

window.salvarIgreja = async function(e) {
  e.preventDefault();
  const id = document.getElementById('igreja-id').value;
  const nome = document.getElementById('igreja-nome').value.trim();
  const presbiterio_id = parseInt(document.getElementById('igreja-presbiterio-id').value);

  if (!nome) {
    showToast('Informe o nome da igreja.', 'error');
    return;
  }
  if (!presbiterio_id) {
    showToast('Selecione um presbitério.', 'error');
    return;
  }

  try {
    if (id) {
      await API.request(`/admin/igrejas/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ nome, presbiterio_id })
      });
      showToast('Igreja atualizada com sucesso!', 'success');
    } else {
      await API.request('/admin/igrejas', {
        method: 'POST',
        body: JSON.stringify({ nome, presbiterio_id })
      });
      showToast('Igreja adicionada com sucesso!', 'success');
    }
    resetFormIgreja();
    loadIgrejas();
  } catch (err) {
    showToast(err.message || 'Erro ao salvar igreja.', 'error');
  }
};

window.deletarIgreja = async function(id) {
  if (confirm('Deseja realmente excluir esta igreja?')) {
    try {
      await API.request(`/admin/igrejas/${id}`, {
        method: 'DELETE'
      });
      showToast('Igreja excluída com sucesso!', 'success');
      loadIgrejas();
    } catch (err) {
      showToast(err.message || 'Erro ao excluir igreja.', 'error');
    }
  }
};

function initGincana() {
  // Módulo Gincana (em desenvolvimento)
}

// ==============================================================
// Controle de Perfis de Acesso & Gerenciamento de Administradores
// ==============================================================

function aplicarRestricoesPerfilAdmin(user) {
  if (!user || !user.is_admin) return;

  const perfil = String(user.perfil_acesso || 'global').toLowerCase().trim();
  const path = window.location.pathname.toLowerCase();

  // 1. Adicionar classe no body para ativação de estilos CSS imediatos
  document.body.classList.remove('perfil-admin-global', 'perfil-admin-gincana');
  document.body.classList.add(`perfil-admin-${perfil}`);

  const temPermissao = (modulo) => {
    if (perfil === 'global') return true;
    const permissoes = perfil.split(',').map(p => p.trim());
    return permissoes.includes('global') || permissoes.includes(modulo);
  };

  const apenasGincana = (perfil === 'gincana');

  // 2. Proteção de rota no lado do cliente: Redirecionar se acessar página não autorizada
  if (apenasGincana) {
    const emGincana = path.includes('gincana');
    if (!emGincana) {
      window.location.replace('gincana.html');
      return;
    }
  } else if (!temPermissao('global')) {
    if (path.includes('configuracoes') && !temPermissao('configuracoes')) {
      window.location.replace(temPermissao('gincana') ? 'gincana.html' : 'index.html');
      return;
    }
    if ((path.includes('index') || path.includes('gerenciar-evento') || path.endsWith('/admin/') || path.endsWith('/admin')) && !temPermissao('eventos')) {
      window.location.replace(temPermissao('gincana') ? 'gincana.html' : 'index.html');
      return;
    }
  }

  // 3. Ocultar itens da sidebar de abas às quais o perfil não tem acesso
  document.querySelectorAll('.sidebar-menu li, .sidebar-link').forEach(el => {
    const link = el.tagName === 'A' ? el : el.querySelector('a');
    if (!link) return;
    const li = el.tagName === 'LI' ? el : el.closest('li');

    // Botão de logout nunca oculta
    if (link.classList.contains('btn-logout') || link.textContent.toLowerCase().includes('sair')) {
      return;
    }

    const dataAba = (li && li.getAttribute('data-aba')) || (link && link.getAttribute('data-aba')) || '';
    const href = (link.getAttribute('href') || link.href || '').toLowerCase();
    const text = (link.textContent || '').toLowerCase();

    const isGincana = dataAba === 'gincana' || href.includes('gincana') || text.includes('gincana');
    const isEventos = dataAba === 'eventos' || href.includes('index') || text.includes('dashboard') || text.includes('evento');
    const isConfig = dataAba === 'configuracoes' || href.includes('configura') || text.includes('configura');

    if (isGincana) {
      if (!temPermissao('gincana')) {
        if (li) li.style.setProperty('display', 'none', 'important');
        link.style.setProperty('display', 'none', 'important');
      } else {
        if (li) li.style.removeProperty('display');
        link.style.removeProperty('display');
      }
    } else if (isEventos) {
      if (apenasGincana || (!temPermissao('eventos') && !temPermissao('global'))) {
        if (li) li.style.setProperty('display', 'none', 'important');
        link.style.setProperty('display', 'none', 'important');
      } else {
        if (li) li.style.removeProperty('display');
        link.style.removeProperty('display');
      }
    } else if (isConfig) {
      if (apenasGincana || (!temPermissao('configuracoes') && !temPermissao('global'))) {
        if (li) li.style.setProperty('display', 'none', 'important');
        link.style.setProperty('display', 'none', 'important');
      } else {
        if (li) li.style.removeProperty('display');
        link.style.removeProperty('display');
      }
    }
  });

  // 4. Exibir badge do perfil no menu
  const brandSub = document.querySelector('.sidebar-brand');
  if (brandSub && perfil !== 'global') {
    let badge = document.getElementById('badge-perfil-sidebar');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'badge-perfil-sidebar';
      brandSub.appendChild(badge);
    }
    badge.style.cssText = 'font-size: 0.68rem; color: #F59E0B; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.2rem; display: block;';
    badge.textContent = `Acesso: ${perfil.toUpperCase()}`;
  }
}

// Tornar global para acesso de outras páginas/scripts se necessário
window.aplicarRestricoesPerfilAdmin = aplicarRestricoesPerfilAdmin;

let cachedAdmins = [];
let debounceBuscaAdmin = null;
let usuarioSelecionadoNovoAdmin = null;

async function loadAdministradores() {
  const container = document.getElementById('admins-table-body');
  if (!container) return;

  const currentUser = API.getUser() || {};

  try {
    const data = await API.request('/admin/administradores');
    cachedAdmins = data;

    if (!data || data.length === 0) {
      container.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem 0;">Nenhum administrador encontrado.</td></tr>`;
      return;
    }

    container.innerHTML = data.map(adm => {
      const perfil = (adm.perfil_acesso || 'global').toLowerCase().trim();
      let badgePerfil = '';
      if (perfil === 'global') {
        badgePerfil = `<span class="badge" style="background: rgba(37,99,235,0.1); color: #2563EB; border: 1px solid rgba(37,99,235,0.25); font-weight: 700; padding: 0.25rem 0.65rem; border-radius: 20px; font-size: 0.78rem;">🛡️ Admin Global</span>`;
      } else if (perfil === 'gincana') {
        badgePerfil = `<span class="badge" style="background: rgba(245,158,11,0.12); color: #D97706; border: 1px solid rgba(245,158,11,0.3); font-weight: 700; padding: 0.25rem 0.65rem; border-radius: 20px; font-size: 0.78rem;">🏆 Gincana</span>`;
      } else {
        badgePerfil = `<span class="badge" style="background: rgba(100,116,139,0.12); color: #475569; border: 1px solid rgba(100,116,139,0.3); font-weight: 700; padding: 0.25rem 0.65rem; border-radius: 20px; font-size: 0.78rem;">⚙️ ${perfil.toUpperCase()}</span>`;
      }

      const isCurrent = (adm.id === currentUser.id);
      const btnRevogar = isCurrent
        ? `<button class="btn btn-outline" style="padding: 0.25rem 0.5rem; font-size: 0.78rem; opacity: 0.5; cursor: not-allowed;" title="Você não pode revogar seu próprio acesso" disabled>Revogar</button>`
        : `<button class="btn btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.78rem;" onclick="revogarAdmin(${adm.id}, '${adm.nome.replace(/'/g, "\\'")}')">Revogar</button>`;

      return `
        <tr>
          <td>
            <strong>${adm.nome}</strong>
            ${isCurrent ? '<span style="font-size: 0.72rem; color: #10B981; font-weight: 700; margin-left: 0.35rem;">(Você)</span>' : ''}
          </td>
          <td>${adm.email}</td>
          <td>${adm.telefone || adm.cpf || '-'}</td>
          <td>${badgePerfil}</td>
          <td style="text-align: right; white-space: nowrap;">
            <button class="btn btn-outline" style="padding: 0.25rem 0.5rem; font-size: 0.78rem; margin-right: 0.35rem;" onclick="abrirModalEditarPerfil(${adm.id}, '${adm.nome.replace(/'/g, "\\'")}', '${perfil}')">✏️ Perfil</button>
            ${btnRevogar}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-danger); padding: 1.5rem 0;">${err.message || 'Erro ao carregar administradores.'}</td></tr>`;
  }
}

window.abrirModalEditarPerfil = function(id, nome, perfil) {
  const modal = document.getElementById('modal-editar-perfil');
  if (!modal) return;
  document.getElementById('modal-editar-usuario-id').value = id;
  document.getElementById('modal-editar-nome-admin').textContent = nome;
  document.getElementById('modal-editar-select-perfil').value = perfil || 'global';
  modal.style.display = 'flex';
};

window.fecharModalEditarPerfil = function() {
  const modal = document.getElementById('modal-editar-perfil');
  if (modal) modal.style.display = 'none';
};

window.salvarPerfilAdmin = async function() {
  const id = document.getElementById('modal-editar-usuario-id').value;
  const perfil = document.getElementById('modal-editar-select-perfil').value;

  try {
    await API.request(`/admin/usuarios/${id}/perfil`, {
      method: 'PUT',
      body: JSON.stringify({ is_admin: true, perfil_acesso: perfil })
    });

    showToast('Perfil de acesso atualizado com sucesso!', 'success');
    fecharModalEditarPerfil();
    loadAdministradores();
  } catch (err) {
    showToast(err.message || 'Erro ao atualizar perfil.', 'error');
  }
};

window.revogarAdmin = async function(id, nome) {
  if (confirm(`Deseja realmente revogar os privilégios de administrador de "${nome}"?`)) {
    try {
      await API.request(`/admin/usuarios/${id}/perfil`, {
        method: 'PUT',
        body: JSON.stringify({ is_admin: false, perfil_acesso: 'global' })
      });
      showToast('Acesso de administrador revogado.', 'success');
      loadAdministradores();
    } catch (err) {
      showToast(err.message || 'Erro ao revogar administrador.', 'error');
    }
  }
};

window.abrirModalNovoAdmin = function() {
  const modal = document.getElementById('modal-novo-admin');
  if (!modal) return;
  document.getElementById('busca-novo-admin-input').value = '';
  document.getElementById('busca-novo-admin-resultados').style.display = 'none';
  document.getElementById('busca-novo-admin-resultados').innerHTML = '';
  document.getElementById('selecao-novo-admin-detalhes').style.display = 'none';
  document.getElementById('grupo-perfil-novo-admin').style.display = 'none';
  document.getElementById('btn-confirmar-novo-admin').style.display = 'none';
  document.getElementById('novo-admin-usuario-id').value = '';
  usuarioSelecionadoNovoAdmin = null;
  modal.style.display = 'flex';
};

window.fecharModalNovoAdmin = function() {
  const modal = document.getElementById('modal-novo-admin');
  if (modal) modal.style.display = 'none';
};

window.onBuscarUsuarioAdminDebounced = function(termo) {
  clearTimeout(debounceBuscaAdmin);
  const container = document.getElementById('busca-novo-admin-resultados');
  if (!container) return;

  if (!termo || termo.trim().length < 2) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  debounceBuscaAdmin = setTimeout(async () => {
    container.style.display = 'block';
    container.innerHTML = `<div style="padding: 0.85rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">Buscando usuários...</div>`;

    try {
      const data = await API.request(`/admin/usuarios-busca?q=${encodeURIComponent(termo.trim())}`);
      if (!data || data.length === 0) {
        container.innerHTML = `<div style="padding: 0.85rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">Nenhum usuário encontrado com esse termo.</div>`;
        return;
      }

      container.innerHTML = data.map(u => {
        const jaAdmin = u.is_admin ? `<span style="font-size: 0.72rem; color: #2563EB; font-weight: 700;">(Já é Admin - ${u.perfil_acesso || 'global'})</span>` : '';
        return `
          <div style="padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-color); cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.15s;"
               onmouseover="this.style.background='#F1F5F9'" 
               onmouseout="this.style.background='transparent'"
               onclick="selecionarUsuarioParaPromover(${u.id}, '${u.nome.replace(/'/g, "\\'")}', '${u.email}', '${u.perfil_acesso || 'global'}')">
            <div>
              <strong style="font-size: 0.9rem; color: var(--text-main);">${u.nome}</strong> ${jaAdmin}
              <div style="font-size: 0.8rem; color: var(--text-muted);">${u.email} ${u.cpf ? '• ' + u.cpf : ''}</div>
            </div>
            <button type="button" class="btn btn-outline btn-sm" style="pointer-events: none; font-size: 0.75rem;">Selecionar</button>
          </div>
        `;
      }).join('');
    } catch (err) {
      container.innerHTML = `<div style="padding: 0.85rem; text-align: center; color: var(--text-danger); font-size: 0.85rem;">Erro ao buscar usuários.</div>`;
    }
  }, 300);
};

window.selecionarUsuarioParaPromover = function(id, nome, email, perfil) {
  document.getElementById('novo-admin-usuario-id').value = id;
  document.getElementById('selecao-novo-admin-nome').textContent = nome;
  document.getElementById('selecao-novo-admin-email').textContent = email;
  document.getElementById('selecao-novo-admin-detalhes').style.display = 'block';
  document.getElementById('novo-admin-select-perfil').value = perfil || 'global';
  document.getElementById('grupo-perfil-novo-admin').style.display = 'block';
  document.getElementById('btn-confirmar-novo-admin').style.display = 'inline-block';
  document.getElementById('busca-novo-admin-resultados').style.display = 'none';
};

window.confirmarNovoAdmin = async function() {
  const id = document.getElementById('novo-admin-usuario-id').value;
  const perfil = document.getElementById('novo-admin-select-perfil').value;

  if (!id) {
    showToast('Selecione um usuário para promover.', 'error');
    return;
  }

  try {
    await API.request(`/admin/usuarios/${id}/perfil`, {
      method: 'PUT',
      body: JSON.stringify({ is_admin: true, perfil_acesso: perfil })
    });

    showToast('Novo administrador configurado com sucesso!', 'success');
    fecharModalNovoAdmin();
    loadAdministradores();
  } catch (err) {
    showToast(err.message || 'Erro ao configurar administrador.', 'error');
  }
};

