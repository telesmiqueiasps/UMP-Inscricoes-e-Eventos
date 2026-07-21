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
        <td>Até ${ev.max_parcelas}x</td>
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
  document.getElementById('modal-evento-title').textContent = 'Novo Evento';
  document.getElementById('evento-modal').style.display = 'flex';
}

function fecharModalEvento() {
  document.getElementById('evento-modal').style.display = 'none';
}

async function salvarEvento(e) {
  e.preventDefault();
  const id = document.getElementById('evento-id').value;
  const payload = {
    titulo: document.getElementById('ev-titulo').value,
    descricao: document.getElementById('ev-descricao').value,
    data_inicio: new Date(document.getElementById('ev-inicio').value).toISOString(),
    data_fim: new Date(document.getElementById('ev-fim').value).toISOString(),
    local: document.getElementById('ev-local').value,
    valor: parseFloat(document.getElementById('ev-valor').value),
    max_participantes: parseInt(document.getElementById('ev-max-part').value) || null,
    max_parcelas: parseInt(document.getElementById('ev-max-parc').value) || 1,
    ativo: document.getElementById('ev-ativo').checked,
    link_pagamento_cartao: document.getElementById('ev-link-cartao').value || null,
    link_pagamento_pix: document.getElementById('ev-link-pix').value || null
  };

  try {
    if (id) {
      await API.request(`/admin/eventos/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Evento atualizado com sucesso!', 'success');
    } else {
      await API.request('/admin/eventos', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Evento criado com sucesso!', 'success');
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
    document.getElementById('ev-max-parc').value = ev.max_parcelas;
    document.getElementById('ev-link-cartao').value = ev.link_pagamento_cartao || '';
    document.getElementById('ev-link-pix').value = ev.link_pagamento_pix || '';
    document.getElementById('ev-ativo').checked = ev.ativo;

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
async function initInscricoes() {
  loadInscricoes();
}

async function loadInscricoes() {
  const container = document.getElementById('inscricoes-table-body');
  if (!container) return;

  const status = document.getElementById('filter-status').value;
  const search = document.getElementById('filter-search').value;

  let queryStr = `?page=1&limit=50`;
  if (status) queryStr += `&status_filtro=${status}`;
  if (search) queryStr += `&search=${encodeURIComponent(search)}`;

  try {
    const data = await API.request(`/admin/inscricoes${queryStr}`);
    container.innerHTML = data.map(ins => `
      <tr>
        <td>#${ins.id}</td>
        <td><strong>${ins.usuario ? ins.usuario.nome : 'N/A'}</strong><br><small style="color:var(--text-muted);">${ins.usuario ? ins.usuario.email : ''}</small></td>
        <td>${ins.evento ? ins.evento.titulo : 'N/A'}</td>
        <td>${ins.forma_pagamento || 'N/A'}</td>
        <td>R$ ${parseFloat(ins.valor_total).toFixed(2).replace('.', ',')}</td>
        <td><span class="badge ${ins.status === 'CONFIRMADA' ? 'badge-success' : ins.status === 'PENDENTE' ? 'badge-warning' : 'badge-danger'}">${ins.status}</span></td>
        <td>
          ${ins.status !== 'CONFIRMADA' ? `<button class="btn btn-success" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="alterarStatusInscricao(${ins.id}, 'CONFIRMADA')">Confirmar</button>` : ''}
          ${ins.status !== 'CANCELADA' ? `<button class="btn btn-danger" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="alterarStatusInscricao(${ins.id}, 'CANCELADA')">Cancelar</button>` : ''}
        </td>
      </tr>
    `).join('');
  } catch (err) {}
}

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
              <td>${pag.forma_pagamento}</td>
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
            <td>${pag.forma_pagamento}</td>
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
