document.addEventListener('DOMContentLoaded', async () => {
  const token = API.getToken();
  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  const welcomeUser = document.getElementById('welcome-user');
  const userInfoCard = document.getElementById('user-info-card');
  const registrationCard = document.getElementById('registration-card');
  const paymentsContainer = document.getElementById('payments-container');

  try {
    const data = await API.request('/usuario/dashboard');

    // 1. Dados Pessoais
    if (welcomeUser && data.usuario) welcomeUser.textContent = `Olá, ${data.usuario.nome}!`;
    if (userInfoCard && data.usuario) {
      userInfoCard.innerHTML = `
        <h3 class="card-title" style="font-size: 1.1rem;">Meus Dados Pessoais</h3>
        <p><strong>Nome:</strong> ${data.usuario.nome || 'Não informado'}</p>
        <p><strong>E-mail:</strong> ${data.usuario.email || 'Não informado'}</p>
        <p><strong>CPF:</strong> ${data.usuario.cpf || 'Não informado'}</p>
        <p><strong>Telefone:</strong> ${data.usuario.telefone || 'Não informado'}</p>
      `;
    }

    // 2. Inscrição Ativa
    if (registrationCard) {
      if (!data.inscricoes || data.inscricoes.length === 0) {
        registrationCard.innerHTML = `
          <h3 class="card-title">Inscrições</h3>
          <p style="color: var(--text-muted);">Você ainda não possui inscrições realizadas.</p>
          <a href="https://inscricoessinodalpb.netlify.app/" class="btn btn-primary" style="margin-top: 1rem;">Ver Eventos Disponíveis</a>
        `;
      } else {
        const ins = data.inscricoes[0];
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
      }
    }

    // 3. Pagamentos e Parcelas
    if (paymentsContainer) {
      if (!data.pagamentos || data.pagamentos.length === 0) {
        paymentsContainer.innerHTML = `<p style="color: var(--text-muted);">Nenhum pagamento registrado.</p>`;
      } else {
        paymentsContainer.innerHTML = data.pagamentos.map(pag => {
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
                    ${parc.copia_cola_pix ? 
                      (parc.copia_cola_pix.startsWith('http') ? 
                        `<a href="${parc.copia_cola_pix}" target="_blank" class="btn btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; text-decoration: none;">Pagar Pix</a>` : 
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
                ${pag.receipt_url ? `<a href="${pag.receipt_url}" target="_blank" class="btn btn-primary" style="margin-top: 0.5rem;">Link de Pagamento</a>` : ''}
              </div>
            `;
          }
        }).join('');
      }
    }

  } catch (err) {
    showToast('Erro ao carregar dados do painel.', 'error');
  }
});

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
