let currentDashboardData = null;

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
          <button class="btn btn-outline" style="padding: 0.35rem 0.75rem; font-size: 0.85rem;" onclick="openEditModal()">✏️ Editar</button>
        </div>
        <p><strong>Nome:</strong> ${data.usuario.nome || 'Não informado'}</p>
        <p><strong>E-mail:</strong> ${data.usuario.email || 'Não informado'}</p>
        <p><strong>CPF:</strong> ${data.usuario.cpf || 'Não informado'}</p>
        <p><strong>Telefone:</strong> ${data.usuario.telefone || 'Não informado'}</p>
      `;
    }

    // 3. Inscrição Recente (Aba "Meu Painel" deve mostrar apenas a mais recente)
    if (registrationCard) {
      if (!data.inscricoes || data.inscricoes.length === 0) {
        registrationCard.innerHTML = `
          <h3 class="card-title">Inscrições</h3>
          <p style="color: var(--text-muted);">Você ainda não possui inscrições realizadas.</p>
          <a href="https://inscricoessinodalpb.netlify.app/" class="btn btn-primary" style="margin-top: 1rem;">Ver Eventos Disponíveis</a>
        `;
        if (paymentsContainer) {
          paymentsContainer.innerHTML = `<p style="color: var(--text-muted);">Nenhum pagamento registrado.</p>`;
        }
      } else {
        const ins = data.inscricoes[0]; // mais recente
        const statusBadge = ins.status === 'CONFIRMADA' ? 'badge-success' : ins.status === 'PENDENTE' ? 'badge-warning' : 'badge-danger';
        const valorFmt = parseFloat(ins.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        
        registrationCard.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <span class="badge ${statusBadge}">${ins.status}</span>
              <h3 class="card-title" style="margin-top: 0.5rem;">${ins.evento_titulo || 'Evento'}</h3>
            </div>
            <div style="font-size: 1.25rem; font-weight: 800; color: var(--primary);">
              ${valorFmt}
            </div>
          </div>
          <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.5rem;">
            📍 Local: ${ins.evento_local || 'A definir'}<br>
            💳 Forma de Pagamento: <strong>${formatarFormaPagamento(ins.forma_pagamento, ins.capture_method)}</strong>
          </p>
        `;

        // Renderizar apenas os pagamentos da inscrição mais recente
        const pagamentosRecentes = data.pagamentos.filter(pag => pag.inscricao_id === ins.id);
        renderRecentPayments(pagamentosRecentes);
      }
    }

    // 4. Renderizar histórico de todas as inscrições para a Aba de Inscrições
    renderAllInscricoes(data.inscricoes, data.pagamentos);

  } catch (err) {
    showToast('Erro ao carregar dados do painel.', 'error');
  }
}

function renderRecentPayments(pagamentos) {
  if (!paymentsContainer) return;
  if (!pagamentos || pagamentos.length === 0) {
    paymentsContainer.innerHTML = `<p style="color: var(--text-muted);">Nenhum pagamento registrado.</p>`;
    return;
  }

  paymentsContainer.innerHTML = pagamentos.map(pag => {
    if (pag.parcelas && pag.parcelas.length > 0) {
      const parcelasRows = pag.parcelas.map(parc => {
        const valorParcFmt = parseFloat(parc.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const pdfUrl = `${API_BASE_URL}/pagamentos/parcelas/${parc.id}/pdf?token=${API.getToken()}`;

        return `
          <tr>
            <td>Parcela ${parc.numero}</td>
            <td>${parc.vencimento ? new Date(parc.vencimento + (parc.vencimento.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('pt-BR') : 'N/A'}</td>
            <td>${valorParcFmt}</td>
            <td><span class="badge ${parc.status === 'PAGO' ? 'badge-success' : 'badge-warning'}">${parc.status}</span></td>
            <td>
              ${parc.status !== 'PAGO' && parc.copia_cola_pix ? 
                (parc.copia_cola_pix.startsWith('http') ? 
                  `<a href="${parc.copia_cola_pix}" target="_blank" class="btn btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; text-decoration: none;">Pagar Parcela</a>` : 
                  `<button class="btn btn-outline" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick="copiarPixString('${parc.copia_cola_pix}')">Copiar Pix</button>`
                ) : ''
              }
              <a href="${pdfUrl}" target="_blank" class="btn btn-outline" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; margin-left: 0.25rem;">
                📄 Carnê PDF
              </a>
            </td>
          </tr>
        `;
      }).join('');

      return `
        <div class="card">
          <h3 class="card-title" style="font-size: 1.1rem; margin-bottom: 1rem;">Parcelamento (${pag.evento_titulo || 'Evento'})</h3>
          <div style="overflow-x: auto;">
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
        </div>
      `;
    } else {
      const valorPagFmt = parseFloat(pag.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      return `
        <div class="card">
          <h3 class="card-title" style="font-size: 1.1rem;">Pagamento - ${formatarFormaPagamento(pag.forma_pagamento, pag.capture_method)}</h3>
          <p>Valor: ${valorPagFmt} | Status: <span class="badge ${pag.status === 'PAGO' ? 'badge-success' : 'badge-warning'}">${pag.status}</span></p>
          ${pag.receipt_url ? 
            (pag.status === 'PAGO' ? 
              `<a href="${pag.receipt_url}" target="_blank" class="btn btn-outline" style="margin-top: 0.5rem; border-color: #10B981; color: #10B981; text-decoration: none; font-weight: 600; display: inline-block; padding: 0.5rem 1rem; border-radius: var(--radius-md);">📄 Comprovante de Pagamento</a>` :
              `<a href="${pag.receipt_url}" target="_blank" class="btn btn-primary" style="margin-top: 0.5rem; display: inline-block;">Pagar Inscrição</a>`
            ) : ''
          }
        </div>
      `;
    }
  }).join('');
}

function renderAllInscricoes(inscricoes, pagamentos) {
  const container = document.getElementById('all-registrations-container');
  if (!container) return;

  if (!inscricoes || inscricoes.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted);">Nenhum histórico de inscrições encontrado.</p>`;
    return;
  }

  container.innerHTML = inscricoes.map(ins => {
    const insPags = pagamentos.filter(pag => pag.inscricao_id === ins.id);
    
    // Somar total pago
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
    const badgeClass = ins.status === 'CONFIRMADA' ? 'badge-success' : ins.status === 'PENDENTE' ? 'badge-warning' : 'badge-danger';

    let pagamentosHTML = '';
    if (insPags.length > 0) {
      pagamentosHTML = `
        <div style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
          <h4 style="font-size: 0.9rem; font-weight: 700; margin-bottom: 0.5rem; color: var(--primary);">Histórico Financeiro da Inscrição:</h4>
          <table style="font-size: 0.85rem; width: 100%;">
            <thead>
              <tr style="background: #f1f5f9;">
                <th style="padding: 0.25rem 0.5rem;">Forma</th>
                <th style="padding: 0.25rem 0.5rem;">Valor</th>
                <th style="padding: 0.25rem 0.5rem;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${insPags.map(pag => {
                const valFmt = parseFloat(pag.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                const desc = pag.forma_pagamento === 'PARCELADO' ? `Parcelado (${pag.parcelas.length}x)` : formatarFormaPagamento(pag.forma_pagamento, pag.capture_method);
                return `
                  <tr>
                    <td style="padding: 0.25rem 0.5rem;">${desc}</td>
                    <td style="padding: 0.25rem 0.5rem;">${valFmt}</td>
                    <td style="padding: 0.25rem 0.5rem;"><span class="badge ${pag.status === 'PAGO' ? 'badge-success' : 'badge-warning'}">${pag.status}</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    return `
      <div class="card" style="margin-bottom: 1.5rem; border: 1.5px solid var(--border-color); background: #fdfdfd; box-shadow: none;">
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
            <div style="font-size: 1.15rem; font-weight: 800; color: var(--primary);">${totalInscFmt}</div>
            <div style="font-size: 0.8rem; color: #10B981; font-weight: 600; margin-top: 0.25rem;">Total Pago: ${totalPagoFmt}</div>
          </div>
        </div>
        ${pagamentosHTML}
      </div>
    `;
  }).join('');
}

window.switchTab = function(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  const target = document.getElementById(tabId);
  if (target) target.style.display = 'block';

  document.querySelectorAll('.sidebar-link').forEach(el => el.classList.remove('active'));
  if (tabId === 'tab-painel') {
    document.getElementById('menu-painel').classList.add('active');
  } else if (tabId === 'tab-eventos') {
    document.getElementById('menu-eventos').classList.add('active');
  }
}

window.openEditModal = function() {
  if (!currentDashboardData || !currentDashboardData.usuario) return;
  const user = currentDashboardData.usuario;
  document.getElementById('edit-nome').value = user.nome || '';
  document.getElementById('edit-email').value = user.email || '';
  document.getElementById('edit-telefone').value = user.telefone || '';
  document.getElementById('edit-senha').value = '';
  document.getElementById('edit-profile-modal').style.display = 'block';
}

window.closeEditModal = function() {
  document.getElementById('edit-profile-modal').style.display = 'none';
}

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
}

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
