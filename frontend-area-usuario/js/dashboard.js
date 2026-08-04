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

let activeInscricaoId = null;

async function loadDashboard() {
  try {
    const data = await API.request('/usuario/dashboard');
    currentDashboardData = data;

    // 1. Nome de boas-vindas
    if (welcomeUser && data.usuario) welcomeUser.textContent = `Olá, ${data.usuario.nome}!`;

    // Renderizar Banner de Triagens Pendentes de Pagamento
    const triagensContainer = document.getElementById('triagem-banner-container');
    if (triagensContainer) {
      if (data.triagens && data.triagens.length > 0) {
        triagensContainer.innerHTML = data.triagens.map(tr => `
          <div style="background: #FEF3C7; border: 1.5px solid #F59E0B; border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
            <div>
              <div style="color: #92400E; font-weight: 700; font-size: 1rem;">⏳ Inscrição Pendente de Pagamento</div>
              <div style="color: #78350F; font-size: 0.9rem; margin-top: 0.25rem;">
                Evento: <strong>${tr.evento_titulo}</strong> | Valor: <strong>R$ ${tr.valor_total.toFixed(2).replace('.', ',')}</strong> (${tr.forma_pagamento})
              </div>
              <div style="font-size: 0.8rem; color: #B45309; margin-top: 0.25rem;">
                Sua vaga será confirmada assim que o pagamento (ou a 1ª parcela) for identificado pelo nosso sistema.
              </div>
            </div>
            <a href="https://inscricoessinodalpb.netlify.app/inscricao.html?evento_id=${tr.evento_id}" class="btn btn-primary" style="font-size: 0.9rem; padding: 0.5rem 1rem; font-weight: 600;">
              💳 Concluir Pagamento Agora &rarr;
            </a>
          </div>
        `).join('');
      } else {
        triagensContainer.innerHTML = '';
      }
    }

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

    // Configurar seletor de eventos se houver inscrições
    const selectorContainer = document.getElementById('dashboard-selector-container');
    const eventSelect = document.getElementById('dashboard-event-select');

    if (data.inscricoes && data.inscricoes.length > 0) {
      // Se tiver mais de 1 inscrição, mostra o seletor
      if (data.inscricoes.length > 1) {
        if (selectorContainer) selectorContainer.style.display = 'flex';
        if (eventSelect) {
          eventSelect.innerHTML = data.inscricoes.map(ins => `
            <option value="${ins.id}">${ins.evento_titulo || 'Evento'}</option>
          `).join('');
        }
      } else {
        if (selectorContainer) selectorContainer.style.display = 'none';
      }

      // Definir a inscrição ativa padrão (a mais recente se não estiver selecionada ou não existir na lista)
      const exists = data.inscricoes.some(ins => ins.id === activeInscricaoId);
      if (!activeInscricaoId || !exists) {
        activeInscricaoId = data.inscricoes[0].id;
      }
      
      if (eventSelect) {
        eventSelect.value = activeInscricaoId;
      }

      // Renderizar o evento ativo
      renderActiveRegistration(activeInscricaoId);
    } else {
      if (selectorContainer) selectorContainer.style.display = 'none';
      if (registrationCard) {
        registrationCard.innerHTML = `
          <h3 class="card-title">Inscrições</h3>
          <p style="color: var(--text-muted);">Você ainda não possui inscrições realizadas.</p>
          <a href="https://inscricoessinodalpb.netlify.app/" class="btn btn-primary" style="margin-top: 1rem;">Ver Eventos Disponíveis</a>
        `;
      }
      if (paymentsContainer) {
        paymentsContainer.innerHTML = `<p style="color: var(--text-muted);">Nenhum pagamento registrado.</p>`;
      }
    }

    // 4. Renderizar histórico de todas as inscrições para a Aba de Inscrições
    renderAllInscricoes(data.inscricoes, data.pagamentos);

  } catch (err) {
    showToast('Erro ao carregar dados do painel.', 'error');
  }
}

// Função para mudar o evento ativo no dashboard
window.changeDashboardEvent = function(inscricaoId) {
  activeInscricaoId = parseInt(inscricaoId);
  renderActiveRegistration(activeInscricaoId);
};

// Renderizar dados da inscrição ativa e seus pagamentos
function renderActiveRegistration(inscricaoId) {
  if (!currentDashboardData) return;
  const data = currentDashboardData;
  const ins = data.inscricoes.find(item => item.id === inscricaoId);
  if (!ins) return;

  if (registrationCard) {
    let statusBadge = 'badge-warning';
    if (ins.status === 'CONFIRMADA') statusBadge = 'badge-success';
    else if (ins.status === 'CANCELADA' || ins.status === 'CANCELADO') statusBadge = 'badge-info';
    else if (ins.status === 'VENCIDA' || ins.status === 'VENCIDO') statusBadge = 'badge-danger';
    const valorFmt = parseFloat(ins.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const qrButtonHTML = ins.status === 'CONFIRMADA' && ins.codigo_checkin ? 
      `<button class="btn btn-outline" style="margin-top: 1rem; width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem; border-color: var(--primary); color: var(--primary); font-weight: 600;" onclick="openQrModal('${ins.codigo_checkin}', '${ins.evento_titulo.replace(/'/g, "\\'")}')">
         🔑 Ver QR Code de Check-in
       </button>` : '';
    
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
      ${qrButtonHTML}
    `;
  }

  // Renderizar pagamentos associados à inscrição selecionada
  const pagamentosFiltrados = data.pagamentos.filter(pag => pag.inscricao_id === ins.id);
  renderRecentPayments(pagamentosFiltrados);
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
      const parcelasRows = pag.parcelas.map(parc => {
        const valorParcFmt = parseFloat(parc.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const pdfUrl = `${API_BASE_URL}/pagamentos/parcelas/${parc.id}/pdf?token=${API.getToken()}`;
        const isCancelled = parc.status === 'CANCELADO' || parc.status === 'CANCELADA' || pag.status === 'CANCELADO';

        return `
          <tr>
            <td>Parcela ${parc.numero}</td>
            <td>${parc.vencimento ? new Date(parc.vencimento + (parc.vencimento.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('pt-BR') : 'N/A'}</td>
            <td>${valorParcFmt}</td>
            <td><span class="badge ${getStatusBadge(parc.status)}">${parc.status}</span></td>
            <td>
              ${!isCancelled && parc.status !== 'PAGO' && parc.copia_cola_pix ? 
                (parc.copia_cola_pix.startsWith('http') ? 
                  `<a href="${parc.copia_cola_pix}" target="_blank" class="btn btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; text-decoration: none;">Pagar Parcela</a>` : 
                  `<button class="btn btn-outline" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick="copiarPixString('${parc.copia_cola_pix}')">Copiar Pix</button>`
                ) : ''
              }
              ${!isCancelled ? 
                `<a href="${pdfUrl}" target="_blank" class="btn btn-outline" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; margin-left: 0.25rem;">📄 Carnê PDF</a>` : ''
              }
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
      const isCancelled = pag.status === 'CANCELADO' || pag.status === 'CANCELADA';
      return `
        <div class="card">
          <h3 class="card-title" style="font-size: 1.1rem;">Pagamento - ${formatarFormaPagamento(pag.forma_pagamento, pag.capture_method)}</h3>
          <p>Valor: ${valorPagFmt} | Status: <span class="badge ${getStatusBadge(pag.status)}">${pag.status}</span></p>
          ${pag.receipt_url && !isCancelled ? 
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

  const getStatusBadge = (st) => {
    if (st === 'PAGO') return 'badge-success';
    if (st === 'CANCELADO' || st === 'CANCELADA') return 'badge-info';
    if (st === 'VENCIDO' || st === 'VENCIDA') return 'badge-danger';
    return 'badge-warning';
  };

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
    let badgeClass = 'badge-warning';
    if (ins.status === 'CONFIRMADA') badgeClass = 'badge-success';
    else if (ins.status === 'CANCELADA' || ins.status === 'CANCELADO') badgeClass = 'badge-info';
    else if (ins.status === 'VENCIDA' || ins.status === 'VENCIDO') badgeClass = 'badge-danger';

    let pagamentosHTML = '';
    if (insPags.length > 0) {
      pagamentosHTML = insPags.map(pag => {
        if (pag.parcelas && pag.parcelas.length > 0) {
          const parcelasRows = pag.parcelas.map(parc => {
            const valorParcFmt = parseFloat(parc.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const pdfUrl = `${API_BASE_URL}/pagamentos/parcelas/${parc.id}/pdf?token=${API.getToken()}`;
            const isCancelled = parc.status === 'CANCELADO' || parc.status === 'CANCELADA' || pag.status === 'CANCELADO';

            return `
              <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 0.5rem;">Parcela ${parc.numero}</td>
                <td style="padding: 0.5rem;">${parc.vencimento ? new Date(parc.vencimento + (parc.vencimento.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('pt-BR') : 'N/A'}</td>
                <td style="padding: 0.5rem;">${valorParcFmt}</td>
                <td style="padding: 0.5rem;"><span class="badge ${getStatusBadge(parc.status)}">${parc.status}</span></td>
                <td style="padding: 0.5rem;">
                  ${!isCancelled && parc.status !== 'PAGO' && parc.copia_cola_pix ? 
                    (parc.copia_cola_pix.startsWith('http') ? 
                      `<a href="${parc.copia_cola_pix}" target="_blank" class="btn btn-primary" style="padding: 0.2rem 0.4rem; font-size: 0.75rem; text-decoration: none;">Pagar</a>` : 
                      `<button class="btn btn-outline" style="padding: 0.2rem 0.4rem; font-size: 0.75rem;" onclick="copiarPixString('${parc.copia_cola_pix}')">Copiar Pix</button>`
                    ) : ''
                  }
                  ${!isCancelled ? 
                    `<a href="${pdfUrl}" target="_blank" class="btn btn-outline" style="padding: 0.2rem 0.4rem; font-size: 0.75rem; margin-left: 0.25rem; text-decoration: none;">📄 PDF</a>` : ''
                  }
                </td>
              </tr>
            `;
          }).join('');

          return `
            <div style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
              <h4 style="font-size: 0.9rem; font-weight: 700; margin-bottom: 0.5rem; color: var(--primary);">Parcelamento (Carnê):</h4>
              <div style="overflow-x: auto;">
                <table style="font-size: 0.85rem; width: 100%; border-collapse: collapse;">
                  <thead>
                    <tr style="background: #f1f5f9; border-bottom: 1px solid var(--border-color);">
                      <th style="padding: 0.5rem; text-align: left;">Parcela</th>
                      <th style="padding: 0.5rem; text-align: left;">Vencimento</th>
                      <th style="padding: 0.5rem; text-align: left;">Valor</th>
                      <th style="padding: 0.5rem; text-align: left;">Status</th>
                      <th style="padding: 0.5rem; text-align: left;">Ações</th>
                    </tr>
                  </thead>
                  <tbody>${parcelasRows}</tbody>
                </table>
              </div>
            </div>
          `;
        } else {
          const valorPagFmt = parseFloat(pag.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          const isCancelled = pag.status === 'CANCELADO' || pag.status === 'CANCELADA';
          return `
            <div style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 0.75rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
              <div>
                <h4 style="font-size: 0.9rem; font-weight: 700; margin: 0; color: var(--primary);">Pagamento - ${formatarFormaPagamento(pag.forma_pagamento, pag.capture_method)}</h4>
                <div style="margin-top: 0.25rem; font-size: 0.85rem; color: var(--text-muted);">
                  Valor: ${valorPagFmt} | Status: <span class="badge ${getStatusBadge(pag.status)}">${pag.status}</span>
                </div>
              </div>
              <div>
                ${pag.receipt_url && !isCancelled ? 
                  (pag.status === 'PAGO' ? 
                    `<a href="${pag.receipt_url}" target="_blank" class="btn btn-outline" style="border-color: #10B981; color: #10B981; text-decoration: none; font-weight: 600; padding: 0.35rem 0.75rem; font-size: 0.8rem; border-radius: var(--radius-md);">📄 Comprovante</a>` :
                    `<a href="${pag.receipt_url}" target="_blank" class="btn btn-primary" style="padding: 0.35rem 0.75rem; font-size: 0.8rem; text-decoration: none; border-radius: var(--radius-md);">Pagar Inscrição</a>`
                  ) : ''
                }
              </div>
            </div>
          `;
        }
      }).join('');
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
  } else if (tabId === 'tab-senha') {
    document.getElementById('menu-senha').classList.add('active');
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
  saveBtn.innerHTML = '<span class="spinner"></span> Atualizando...';
  
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
    modal.style.display = 'block';
  }
};

window.closeQrModal = function() {
  const modal = document.getElementById('qr-code-modal');
  if (modal) modal.style.display = 'none';
};
