document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const eventoId = urlParams.get('evento_id');

  const step1 = document.getElementById('step-1');
  const step2 = document.getElementById('step-2');
  const step3 = document.getElementById('step-3');

  const eventSummary = document.getElementById('event-summary');
  const formAuth = document.getElementById('form-auth-wizard');
  const formPagamento = document.getElementById('form-pagamento');
  const numParcelasSelect = document.getElementById('num_parcelas');
  const parcelasGroup = document.getElementById('parcelas-group');
  const paymentResult = document.getElementById('payment-result');

  if (!eventoId) {
    showToast('Nenhum evento selecionado.', 'error');
    setTimeout(() => window.location.href = 'index.html', 2000);
    return;
  }

  let eventoAtual = null;

  // 1. Carregar detalhes do Evento
  try {
    eventoAtual = await API.request(`/eventos/publico/${eventoId}`);
    eventSummary.innerHTML = `
      <h2 style="font-size: 1.5rem; font-weight: 700;">${eventoAtual.titulo}</h2>
      <p style="color: var(--text-muted); margin-bottom: 0.5rem;">${eventoAtual.descricao || ''}</p>
      <div style="font-size: 1.25rem; font-weight: 800; color: var(--primary);">
        Valor Total: R$ ${parseFloat(eventoAtual.valor).toFixed(2).replace('.', ',')}
      </div>
    `;

    // Preencher opções de parcelas
    numParcelasSelect.innerHTML = '';
    const maxParc = eventoAtual.max_parcelas || 1;
    for (let i = 1; i <= maxParc; i++) {
      const valParc = (eventoAtual.valor / i).toFixed(2).replace('.', ',');
      numParcelasSelect.innerHTML += `<option value="${i}">${i}x de R$ ${valParc}</option>`;
    }
  } catch (err) {
    eventSummary.innerHTML = `<p style="color:red">Erro ao carregar evento.</p>`;
    return;
  }

  // 2. Verificar Autenticação
  const user = API.getUser();
  if (user) {
    step1.style.display = 'none';
    step2.style.display = 'block';
  } else {
    step1.style.display = 'block';
    step2.style.display = 'none';
  }

  // Alternar visualização de parcelas no formulário
  document.querySelectorAll('input[name="forma_pagamento"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'PARCELADO') {
        parcelasGroup.style.display = 'block';
      } else {
        parcelasGroup.style.display = 'none';
      }
    });
  });

  // Cadastro/Login Wizard
  if (formAuth) {
    formAuth.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = document.getElementById('nome').value;
      const email = document.getElementById('email').value;
      const cpf = document.getElementById('cpf').value;
      const telefone = document.getElementById('telefone').value;
      const senha = document.getElementById('senha').value;

      try {
        // Tentar Cadastrar ou Logar
        try {
          await API.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ nome, email, cpf, telefone, senha })
          });
        } catch (res) {
          // Se já existir, faz login
        }

        const loginRes = await API.request('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, senha })
        });

        API.setToken(loginRes.access_token);
        API.setUser(loginRes.user);

        showToast('Login realizado com sucesso!', 'success');
        step1.style.display = 'none';
        step2.style.display = 'block';
      } catch (err) {
        showToast('Erro ao realizar autenticação.', 'error');
      }
    });
  }

  // Submeter Pagamento
  if (formPagamento) {
    formPagamento.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formaPagamento = document.querySelector('input[name="forma_pagamento"]:checked').value;
      const numParcelas = parseInt(numParcelasSelect.value) || 1;

      try {
        // 1. Criar Inscrição
        const inscricao = await API.request('/inscricoes', {
          method: 'POST',
          body: JSON.stringify({
            evento_id: parseInt(eventoId),
            forma_pagamento: formaPagamento,
            num_parcelas: numParcelas
          })
        });

        // 2. Processar Pagamento
        const pagamento = await API.request('/pagamentos/processar', {
          method: 'POST',
          body: JSON.stringify({
            inscricao_id: inscricao.id,
            forma_pagamento: formaPagamento,
            num_parcelas: numParcelas
          })
        });

        step2.style.display = 'none';
        step3.style.display = 'block';

        renderPaymentResult(pagamento, formaPagamento);
        showToast('Inscrição e pagamento gerados com sucesso!', 'success');

      } catch (err) {
        showToast(err.message || 'Erro ao processar inscrição.', 'error');
      }
    });
  }

  function renderPaymentResult(pagamento, forma) {
    const userAreaUrl = 'https://usuariosinodalpb.netlify.app/dashboard.html';

    if (forma === 'PIX') {
      paymentResult.innerHTML = `
        <div style="text-align: center;">
          <div class="badge badge-warning" style="margin-bottom: 1rem;">Pagamento Pendente</div>
          <h3>Escaneie o QR Code abaixo para pagar via Pix:</h3>
          <img src="${pagamento.qr_code_pix}" alt="QR Code Pix" style="max-width: 240px; margin: 1.5rem 0; border: 1px solid #ddd; padding: 10px; border-radius: 8px;" />
          
          <div class="form-group" style="text-align: left;">
            <label class="form-label">Pix Copia e Cola:</label>
            <input type="text" readonly class="form-control" value="${pagamento.copia_cola_pix}" id="pix-input" />
            <button class="btn btn-outline" style="width: 100%; margin-top: 0.5rem;" onclick="copiarPix()">Copiar Código Pix</button>
          </div>

          <a href="${userAreaUrl}" class="btn btn-primary" style="margin-top: 1rem;">Ir para Minha Área</a>
        </div>
      `;
    } else if (forma === 'INFINITEPAY') {
      paymentResult.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
          <div class="badge badge-success" style="margin-bottom: 1rem;">Checkout InfinitePay Gerado</div>
          <h3>Clique no botão abaixo para concluir o pagamento no cartão:</h3>
          <a href="${pagamento.receipt_url}" target="_blank" class="btn btn-primary" style="margin: 1.5rem 0; font-size: 1.1rem;">
            💳 Pagar na InfinitePay
          </a>
          <br>
          <a href="${userAreaUrl}" class="btn btn-outline">Ir para Minha Área</a>
        </div>
      `;
    } else if (forma === 'PARCELADO') {
      const parcelasHtml = pagamento.parcelas.map(p => `
        <tr>
          <td>Parcela ${p.numero}</td>
          <td>${new Date(p.vencimento + (p.vencimento.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('pt-BR')}</td>
          <td>R$ ${parseFloat(p.valor).toFixed(2).replace('.', ',')}</td>
          <td><span class="badge badge-warning">${p.status}</span></td>
          <td>
            <a href="${API_BASE_URL}/pagamentos/parcelas/${p.id}/pdf" target="_blank" class="btn btn-outline" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;">
              📄 Baixar PDF
            </a>
          </td>
        </tr>
      `).join('');

      paymentResult.innerHTML = `
        <div>
          <h3>Inscrição Parcelada com Sucesso!</h3>
          <p style="color: var(--text-muted); margin-bottom: 1rem;">Suas parcelas foram geradas. Você pode baixar os comprovantes/carnês em PDF abaixo ou no seu painel.</p>
          
          <div class="table-container" style="margin-bottom: 1.5rem;">
            <table>
              <thead>
                <tr>
                  <th>Parcela</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Carnê PDF</th>
                </tr>
              </thead>
              <tbody>${parcelasHtml}</tbody>
            </table>
          </div>

          <a href="${userAreaUrl}" class="btn btn-primary" style="width: 100%;">Acessar Área do Participante</a>
        </div>
      `;
    }
  }
});

function copiarPix() {
  const input = document.getElementById('pix-input');
  if (input) {
    input.select();
    navigator.clipboard.writeText(input.value);
    showToast('Código Pix copiado para a área de transferência!', 'success');
  }
}
