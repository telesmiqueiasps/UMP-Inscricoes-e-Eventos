let selectedEventoId = null;
let eventoAtual = null;
let cachedInscricoesList = [];
let allEventsList = [];

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
});

// --- Tabs Switcher ---
window.switchSubTab = function(tabId, btn) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  
  document.getElementById(tabId).classList.add('active');
  btn.classList.add('active');
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
    document.getElementById('event-detail-subtitle').textContent = `📅 Início: ${dataInicio} | 💳 Valor: ${valorFmt} | 📍 Local: ${eventoAtual.local || 'A definir'}`;

    // Preencher Formulário de Edição (Tab 3)
    document.getElementById('evento-id').value = eventoAtual.id;
    document.getElementById('ev-titulo').value = eventoAtual.titulo;
    document.getElementById('ev-descricao').value = eventoAtual.descricao || '';
    
    const formatDt = (isoStr) => isoStr ? isoStr.substring(0, 16) : '';
    document.getElementById('ev-inicio').value = formatDt(eventoAtual.data_inicio);
    document.getElementById('ev-fim').value = formatDt(eventoAtual.data_fim);
    
    document.getElementById('ev-local').value = eventoAtual.local || '';
    document.getElementById('ev-valor').value = eventoAtual.valor;
    document.getElementById('ev-max-part').value = eventoAtual.max_participantes || '';
    document.getElementById('ev-ativo').checked = eventoAtual.ativo;

    document.querySelectorAll('.ev-form-field').forEach(cb => {
      cb.checked = eventoAtual.campos_formulario ? eventoAtual.campos_formulario.split(',').includes(cb.value) : false;
    });

    const fotosArray = eventoAtual.fotos ? eventoAtual.fotos.split(',') : [];
    document.getElementById('ev-foto-1').value = fotosArray[0] || '';
    document.getElementById('ev-foto-2').value = fotosArray[1] || '';
    document.getElementById('ev-foto-3').value = fotosArray[2] || '';
    document.getElementById('ev-foto-4').value = fotosArray[3] || '';

  } catch (err) {
    showToast('Erro ao carregar detalhes do evento.', 'error');
  }
}

// --- Carregar Inscrições ---
window.loadInscricoes = async function() {
  const container = document.getElementById('inscricoes-table-body');
  const tableHead = document.getElementById('inscricoes-table-head');
  if (!container) return;

  const status = document.getElementById('filter-status').value;
  const search = document.getElementById('filter-search').value;

  let queryStr = `?page=1&limit=200&evento_id=${selectedEventoId}`;
  if (status) queryStr += `&status_filtro=${status}`;
  if (search) queryStr += `&search=${encodeURIComponent(search)}`;

  try {
    const data = await API.request(`/admin/inscricoes${queryStr}`);
    cachedInscricoesList = data;

    // Descobrir campos dinâmicos exigidos
    let customFields = [];
    if (eventoAtual && eventoAtual.campos_formulario) {
      customFields = eventoAtual.campos_formulario.split(',').filter(f => f.trim() !== '');
    }

    // Atualizar Cabeçalho da Tabela
    let headHTML = `
      <tr>
        <th>ID</th>
        <th>Participante</th>
        <th>Forma Pag.</th>
        <th>Valor Total</th>
    `;
    customFields.forEach(f => {
      headHTML += `<th>${formatarLabelCampo(f)}</th>`;
    });
    headHTML += `
        <th>Status</th>
        <th>Ações Manuais</th>
      </tr>
    `;
    tableHead.innerHTML = headHTML;

    // Preencher Linhas
    if (data.length === 0) {
      container.innerHTML = `<tr><td colspan="${6 + customFields.length}" style="text-align:center;">Nenhuma inscrição encontrada para este evento.</td></tr>`;
      return;
    }

    container.innerHTML = data.map(ins => {
      const valorFmt = parseFloat(ins.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const statusBadge = ins.status === 'CONFIRMADA' ? 'badge-success' : ins.status === 'PENDENTE' ? 'badge-warning' : 'badge-danger';
      const userMail = ins.usuario_email ? ` (${ins.usuario_email})` : '';

      let rowHTML = `
        <tr>
          <td>#${ins.id}</td>
          <td><strong>${ins.usuario_nome || 'N/A'}</strong><div style="font-size:0.75rem; color:var(--text-muted);">${userMail}</div></td>
          <td>${formatarFormaPagamento(ins.forma_pagamento, ins.capture_method)}</td>
          <td>${valorFmt}</td>
      `;

      // Preencher campos dinâmicos
      customFields.forEach(f => {
        const val = (ins.dados_extras && ins.dados_extras[f]) ? ins.dados_extras[f] : '-';
        rowHTML += `<td>${val}</td>`;
      });

      rowHTML += `
          <td><span class="badge ${statusBadge}">${ins.status}</span></td>
          <td>
            <div style="display:flex; gap:0.25rem;">
              ${ins.status !== 'CONFIRMADA' ? `<button class="btn btn-success" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="alterarStatusInscricao(${ins.id}, 'CONFIRMADA')">Confirmar</button>` : ''}
              ${ins.status !== 'CANCELADA' ? `<button class="btn btn-danger" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="alterarStatusInscricao(${ins.id}, 'CANCELADA')">Cancelar</button>` : ''}
            </div>
          </td>
        </tr>
      `;
      return rowHTML;
    }).join('');

  } catch (err) {
    container.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-danger);">Erro ao carregar inscrições.</td></tr>`;
  }
};

window.alterarStatusInscricao = async function(id, novoStatus) {
  try {
    await API.request(`/admin/inscricoes/${id}/status?novo_status=${novoStatus}`, { method: 'PUT' });
    showToast(`Inscrição #${id} atualizada para ${novoStatus}!`, 'success');
    loadInscricoes();
  } catch (err) {}
};

// --- Carregar Pagamentos ---
async function loadPagamentos() {
  const container = document.getElementById('pagamentos-table-body');
  if (!container) return;

  try {
    const pagamentos = await API.request(`/admin/pagamentos?evento_id=${selectedEventoId}`);
    
    if (pagamentos.length === 0) {
      container.innerHTML = `<tr><td colspan="7" style="text-align:center;">Nenhum pagamento registrado para este evento.</td></tr>`;
      return;
    }

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
  } catch (err) {
    container.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-danger);">Erro ao carregar pagamentos.</td></tr>`;
  }
}

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
    cargo_ump: 'Cargo UMP'
  };
  return map[field] || field.toUpperCase();
}

function formatarFormaPagamento(fp, capture) {
  if (fp === 'INFINITEPAY') {
    return capture === 'pix' ? 'Pix (InfinitePay)' : 'Cartão (InfinitePay)';
  }
  return 'Parcelado (Carnê)';
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
    const row = [
      ins.id,
      ins.usuario_nome,
      ins.usuario_email,
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
    const statusBadge = ins.status === 'CONFIRMADA' ? 'badge-success' : ins.status === 'PENDENTE' ? 'badge-warning' : 'badge-danger';
    let cols = `
      <td>#${ins.id}</td>
      <td><strong>${ins.usuario_nome}</strong><br>${ins.usuario_email}</td>
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
    showToast('Imagem enviada com sucesso para o Supabase Storage!', 'success');
  } catch (err) {
    showToast(err.message || 'Erro ao enviar imagem.', 'error');
  } finally {
    label.innerHTML = originalText;
    label.style.pointerEvents = 'auto';
    inputElement.value = '';
  }
};
