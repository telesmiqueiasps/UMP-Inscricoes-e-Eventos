document.addEventListener('DOMContentLoaded', async () => {
  const token = API.getToken();
  if (!token) {
    const path = window.location.pathname;
    const isIndex = path.endsWith('index.html') || path === '/' || path.endsWith('/');
    if (!isIndex) {
      window.location.href = 'index.html';
      return;
    }
    promptAdminLogin();
    return;
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

      try {
        const res = await API.request('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, senha })
        });

        if (!res.user.is_admin) {
          showToast('Usuário não possui privilégios de administrador.', 'error');
          return;
        }

        API.setToken(res.access_token);
        API.setUser(res.user);
        modal.style.display = 'none';
        window.location.reload();
      } catch (err) {
        showToast('Credenciais de admin inválidas.', 'error');
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
    document.getElementById('m-usuarios').textContent = metrics.total_usuarios;
    document.getElementById('m-inscricoes').textContent = metrics.total_inscricoes;
    document.getElementById('m-receita').textContent = `R$ ${metrics.receita_total.toFixed(2).replace('.', ',')}`;

    loadEventosTable();
  } catch (err) {}
}

async function loadEventosTable() {
  const tableBody = document.getElementById('eventos-table-body');
  if (!tableBody) return;
  try {
    const eventos = await API.request('/admin/eventos');
    tableBody.innerHTML = eventos.map(ev => `
      <tr>
        <td>#${ev.id}</td>
        <td><strong>${ev.titulo}</strong></td>
        <td>${new Date(ev.data_inicio).toLocaleDateString('pt-BR')}</td>
        <td>R$ ${parseFloat(ev.valor).toFixed(2).replace('.', ',')}</td>
        <td>${ev.max_participantes ? `${ev.vagas_restantes !== null ? ev.vagas_restantes : ev.max_participantes} / ${ev.max_participantes}` : 'Ilimitado'}</td>
        <td>
          <button class="btn ${ev.ativo ? 'btn-success' : 'btn-danger'}" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="toggleStatusEvento(${ev.id})">
            ${ev.ativo ? 'Ativo' : 'Inativo'}
          </button>
        </td>
        <td>
          <button class="btn btn-outline" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick="editarEvento(${ev.id})">Editar</button>
          <button class="btn btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick="deletarEvento(${ev.id})">Excluir</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {}
}

function abrirModalEvento() {
  document.getElementById('evento-id').value = '';
  document.getElementById('form-evento').reset();
  document.querySelectorAll('.ev-form-field').forEach(cb => cb.checked = false);
  document.getElementById('ev-foto-1').value = '';
  document.getElementById('ev-foto-2').value = '';
  document.getElementById('ev-foto-3').value = '';
  document.getElementById('ev-foto-4').value = '';
  document.getElementById('modal-evento-title').textContent = 'Novo Evento';
  document.getElementById('evento-modal').style.display = 'flex';
}

function fecharModalEvento() {
  document.getElementById('evento-modal').style.display = 'none';
}

async function salvarEvento(e) {
  e.preventDefault();
  const id = document.getElementById('evento-id').value;
  const fieldsSelected = Array.from(document.querySelectorAll('.ev-form-field:checked')).map(cb => cb.value).join(',');
  
  const fotosUrls = [
    document.getElementById('ev-foto-1').value.trim(),
    document.getElementById('ev-foto-2').value.trim(),
    document.getElementById('ev-foto-3').value.trim(),
    document.getElementById('ev-foto-4').value.trim()
  ].filter(url => url !== '').join(',');

  const payload = {
    titulo: document.getElementById('ev-titulo').value,
    descricao: document.getElementById('ev-descricao').value,
    data_inicio: new Date(document.getElementById('ev-inicio').value).toISOString(),
    data_fim: new Date(document.getElementById('ev-fim').value).toISOString(),
    local: document.getElementById('ev-local').value,
    valor: parseFloat(document.getElementById('ev-valor').value),
    max_participantes: parseInt(document.getElementById('ev-max-part').value) || null,
    ativo: document.getElementById('ev-ativo').checked,
    campos_formulario: fieldsSelected || null,
    fotos: fotosUrls || null
  };

  try {
    if (id) {
      await API.request(`/admin/eventos/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Evento updated successfully!', 'success');
    } else {
      await API.request('/admin/eventos', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Evento created successfully!', 'success');
    }
    fecharModalEvento();
    loadEventosTable();
  } catch (err) {}
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

  const status = document.getElementById('filter-status').value;
  const search = document.getElementById('filter-search').value;
  const eventoId = document.getElementById('filter-evento').value;

  let queryStr = `?page=1&limit=200`;
  if (status) queryStr += `&status_filtro=${status}`;
  if (search) queryStr += `&search=${encodeURIComponent(search)}`;
  if (eventoId) queryStr += `&evento_id=${eventoId}`;

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
    cargo_ump: 'Cargo UMP'
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
async function initPagamentos() {
  loadPagamentos();
}

async function loadPagamentos() {
  const container = document.getElementById('pagamentos-table-body');
  if (!container) return;

  try {
    const pagamentos = await API.request('/admin/pagamentos');
    
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
    document.getElementById('config-infinitepay-handle').value = data.infinitepay_handle || '';
    document.getElementById('config-pix-chave').value = data.pix_chave || '';
    document.getElementById('config-pix-nome').value = data.pix_nome_recebedor || '';
    document.getElementById('config-pix-cidade').value = data.pix_cidade_recebedor || '';
  } catch (err) {
    showToast('Erro ao carregar configurações do sistema.', 'error');
  }
}

async function salvarConfiguracoes(e) {
  e.preventDefault();
  const payload = {
    infinitepay_handle: document.getElementById('config-infinitepay-handle').value.trim(),
    pix_chave: document.getElementById('config-pix-chave').value.trim(),
    pix_nome_recebedor: document.getElementById('config-pix-nome').value.trim(),
    pix_cidade_recebedor: document.getElementById('config-pix-cidade').value.trim()
  };

  try {
    await API.request('/admin/configuracoes', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    showToast('Configurações atualizadas com sucesso!', 'success');
  } catch (err) {
    showToast('Erro ao salvar as configurações.', 'error');
  }
}
