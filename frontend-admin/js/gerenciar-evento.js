let selectedEventoId = null;
let eventoAtual = null;
let cachedInscricoesList = [];
let allEventsList = [];

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
    document.getElementById('event-detail-subtitle').textContent = `📅 Início: ${dataInicio} | 💳 Valor: ${valorFmt} | 📍 Local: ${eventoAtual.local || 'A definir'}`;

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
      const user = ins.usuario || {};
      const userMail = user.email ? ` (${user.email})` : '';

      let rowHTML = `
        <tr>
          <td>#${ins.id}</td>
          <td><strong>${user.nome || 'N/A'}</strong><div style="font-size:0.75rem; color:var(--text-muted);">${userMail}</div></td>
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

    renderPagamentosList(pagamentos);
  } catch (err) {
    container.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-danger);">Erro ao carregar pagamentos.</td></tr>`;
  }
}

function renderPagamentosList(pagamentos, statusFilter = '') {
  const container = document.getElementById('pagamentos-table-body');
  if (!container) return;

  // Se o filtro de status estiver ativo, filtrar antes de verificar se está vazio
  let hasAnyRow = false;
  
  let rowsHtml = '';
  pagamentos.forEach(pag => {
    const userDisplay = pag.usuario_nome ? `<strong>${pag.usuario_nome}</strong><br><small style="color:var(--text-muted);">${pag.usuario_email || ''}</small>` : 'N/A';
    const statusBadgeClass = (status) => {
      if (status === 'PAGO') return 'badge-success';
      if (status === 'CANCELADO' || status === 'CANCELADA') return 'badge-info';
      if (status === 'VENCIDO' || status === 'VENCIDA') return 'badge-danger';
      return 'badge-warning';
    };

    if (pag.parcelas && pag.parcelas.length > 0) {
      pag.parcelas.forEach(parc => {
        if (statusFilter && parc.status !== statusFilter) return;
        hasAnyRow = true;

        let actionHTML = '';
        if (parc.status === 'PAGO') {
          actionHTML = '<span style="color:#059669; font-weight:600;">Quitada</span>';
        } else if (parc.status === 'CANCELADO' || parc.status === 'CANCELADA') {
          actionHTML = '<span style="color:#ef4444; font-weight:600;">Cancelada</span>';
        } else {
          actionHTML = `<button class="btn btn-success" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="alterarStatusParcela(${parc.id}, 'PAGO')">Dar Baixa (Pago)</button>`;
        }

        rowsHtml += `
          <tr>
            <td>Pag #${pag.id} (Parc ${parc.numero})</td>
            <td>${userDisplay}</td>
            <td>Inscrição #${pag.inscricao_id}</td>
            <td>${formatarFormaPagamento(pag.forma_pagamento, pag.capture_method)}</td>
            <td>R$ ${parseFloat(parc.valor).toFixed(2).replace('.', ',')}</td>
            <td>${new Date(parc.vencimento + (parc.vencimento.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('pt-BR')}</td>
            <td><span class="badge ${statusBadgeClass(parc.status)}">${parc.status}</span></td>
            <td>${actionHTML}</td>
          </tr>
        `;
      });
    } else {
      if (statusFilter && pag.status !== statusFilter) return;
      hasAnyRow = true;

      rowsHtml += `
        <tr>
          <td>Pag #${pag.id}</td>
          <td>${userDisplay}</td>
          <td>Inscrição #${pag.inscricao_id}</td>
          <td>${formatarFormaPagamento(pag.forma_pagamento, pag.capture_method)}</td>
          <td>R$ ${parseFloat(pag.valor).toFixed(2).replace('.', ',')}</td>
          <td>N/A</td>
          <td><span class="badge ${statusBadgeClass(pag.status)}">${pag.status}</span></td>
          <td>-</td>
        </tr>
      `;
    }
  });

  if (!hasAnyRow) {
    container.innerHTML = `<tr><td colspan="8" style="text-align:center;">Nenhum pagamento correspondente aos filtros.</td></tr>`;
    return;
  }

  container.innerHTML = rowsHtml;
}

window.filterPagamentosLocal = function() {
  const searchVal = document.getElementById('pay-filter-search').value.toLowerCase().trim();
  const methodVal = document.getElementById('pay-filter-method').value;
  const statusVal = document.getElementById('pay-filter-status').value;

  const filtered = allPagamentosCached.filter(pag => {
    if (searchVal) {
      const nameMatch = pag.usuario_nome && pag.usuario_nome.toLowerCase().includes(searchVal);
      const emailMatch = pag.usuario_email && pag.usuario_email.toLowerCase().includes(searchVal);
      const cpfMatch = pag.usuario_cpf && pag.usuario_cpf.toLowerCase().includes(searchVal);
      if (!nameMatch && !emailMatch && !cpfMatch) {
        return false;
      }
    }
    if (methodVal) {
      if (pag.forma_pagamento !== methodVal) {
        return false;
      }
    }
    if (statusVal) {
      if (pag.forma_pagamento === 'PARCELADO') {
        const hasStatus = pag.parcelas.some(parc => parc.status === statusVal);
        if (!hasStatus) return false;
      } else {
        if (pag.status !== statusVal) return false;
      }
    }
    return true;
  });

  renderPagamentosList(filtered, statusVal);
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
    cacheCheckinParticipantes = data || [];
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

  if (list.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">Nenhum participante correspondente encontrado.</td></tr>`;
    return;
  }

  tableBody.innerHTML = list.map(ins => {
    let badgeClass = 'badge-warning';
    if (ins.status === 'CONFIRMADA') badgeClass = 'badge-success';
    else if (ins.status === 'CANCELADA' || ins.status === 'CANCELADO') badgeClass = 'badge-danger';

    const getStatusBadge = (st) => {
      if (st === 'PAGO' || st === 'CONFIRMADA') return 'badge-success';
      if (st === 'CANCELADO' || st === 'CANCELADA') return 'badge-danger';
      return 'badge-warning';
    };

    const checkinStatusHTML = ins.checkin_realizado ? 
      `<div style="color: #10B981; font-weight: 600;">
         ✅ Presente<br>
         <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal;">
           ${ins.checkin_data ? new Date(ins.checkin_data).toLocaleString('pt-BR') : ''}
         </span>
       </div>` : 
      `<span style="color: #F59E0B; font-weight: 600;">❌ Ausente</span>`;

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
}

window.setPresencaFiltro = function(filtro) {
  filtroPresencaAtivo = filtro;

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
        confirmBtn.textContent = '⚠️ Confirmar Mesmo Assim';
        confirmBtn.className = 'btn btn-danger';
        confirmBtn.style.background = '#EF4444';
        confirmBtn.style.borderColor = '#EF4444';
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
        confirmBtn.textContent = '🔄 Confirmar Novamente';
        confirmBtn.className = 'btn btn-primary';
        confirmBtn.style.background = 'var(--primary)';
        confirmBtn.style.borderColor = 'var(--primary)';
      }
    } else {
      if (avisoContainer) avisoContainer.style.display = 'none';
      if (confirmBtn) {
        confirmBtn.textContent = '✅ Confirmar Entrada';
        confirmBtn.className = 'btn btn-success';
        confirmBtn.style.background = '#10B981';
        confirmBtn.style.borderColor = '#10B981';
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
