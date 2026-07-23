document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const eventoId = urlParams.get('evento_id');

  const step1 = document.getElementById('step-1');
  const step2 = document.getElementById('step-2');
  const step3 = document.getElementById('step-3');

  const loggedUserBanner = document.getElementById('logged-user-banner');
  const loggedUserMsg = document.getElementById('logged-user-msg');

  const eventSummary = document.getElementById('event-summary');
  
  // Formulários da Etapa 1
  const formEmailCheck = document.getElementById('form-email-check');
  const formAuthLogin = document.getElementById('form-auth-login');
  const formAuthRegister = document.getElementById('form-auth-register');

  // Formulário da Etapa 2
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
  let emailDigitado = '';

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

    // Configurar inicial da data da primeira parcela
    const inputDataPrimeira = document.getElementById('data_primeira_parcela');
    const hojeStr = new Date().toISOString().split('T')[0];
    inputDataPrimeira.min = hojeStr;
    if (eventoAtual.data_inicio) {
      inputDataPrimeira.max = new Date(eventoAtual.data_inicio).toISOString().split('T')[0];
    }
    
    let dataPadrao = new Date(Date.now() + 86400000 * 5); // 5 dias no futuro
    const dataLimite = new Date(eventoAtual.data_inicio);
    if (dataPadrao > dataLimite) {
      dataPadrao = dataLimite;
    }
    inputDataPrimeira.value = dataPadrao.toISOString().split('T')[0];

    // Função para recalcular parcelas
    window.recalcularDropdownParcelas = function() {
      const dataSelStr = inputDataPrimeira.value;
      if (!dataSelStr) return;

      const d1 = new Date(dataSelStr + 'T00:00:00');
      const limit = new Date(eventoAtual.data_inicio);
      d1.setHours(0,0,0,0);
      limit.setHours(0,0,0,0);

      let maxParc = 1;
      if (d1 > limit) {
        maxParc = 0;
      } else if (d1.getTime() === limit.getTime()) {
        maxParc = 1;
      } else {
        let count = 1;
        let current = new Date(d1);
        while (true) {
          let next = new Date(d1);
          next.setMonth(d1.getMonth() + count);
          
          if (next > limit) {
            if (current.getTime() < limit.getTime()) {
              // Só adicionamos se o mês da data limite for diferente do mês da parcela anterior
              if (!(limit.getFullYear() === current.getFullYear() && limit.getMonth() === current.getMonth())) {
                count++;
              }
            }
            break;
          }
          current = next;
          count++;
        }
        maxParc = count;
      }

      numParcelasSelect.innerHTML = '';
      if (maxParc < 1) {
        numParcelasSelect.innerHTML = '<option value="0">Indisponível (Excede a data do evento)</option>';
        return;
      }

      for (let i = 1; i <= maxParc; i++) {
        const valParc = (eventoAtual.valor / i).toFixed(2).replace('.', ',');
        numParcelasSelect.innerHTML += `<option value="${i}">${i}x de R$ ${valParc}</option>`;
      }
    };

    inputDataPrimeira.addEventListener('change', window.recalcularDropdownParcelas);
    window.recalcularDropdownParcelas();
  } catch (err) {
    eventSummary.innerHTML = `<p style="color:red">Erro ao carregar evento.</p>`;
    return;
  }

  // 2. Atualizar UI baseada em login ativo
  atualizarEstadoUsuario();

  // Alternar visualização de parcelas no formulário de pagamento
  document.querySelectorAll('input[name="forma_pagamento"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'PARCELADO') {
        parcelasGroup.style.display = 'block';
        window.recalcularDropdownParcelas();
      } else {
        parcelasGroup.style.display = 'none';
      }
    });
  });

  // --- FLUXO ETAPA 1 ---

  // Formulário A: Verificar E-mail
  if (formEmailCheck) {
    formEmailCheck.addEventListener('submit', async (e) => {
      e.preventDefault();
      emailDigitado = document.getElementById('email-verify').value.trim();
      if (!emailDigitado) return;

      try {
        const res = await API.request(`/auth/check-email?email=${encodeURIComponent(emailDigitado)}`);
        
        formEmailCheck.style.display = 'none';
        if (res.exists) {
          // E-mail cadastrado: Exibir login
          formAuthLogin.style.display = 'block';
          formAuthRegister.style.display = 'none';
          document.getElementById('senha-login').focus();
        } else {
          // Novo cadastro: Exibir campos adicionais
          formAuthLogin.style.display = 'none';
          formAuthRegister.style.display = 'block';
          document.getElementById('nome-reg').focus();
        }
      } catch (err) {
        showToast('Erro ao validar e-mail.', 'error');
      }
    });
  }

  // Formulário B: Login
  if (formAuthLogin) {
    formAuthLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const senha = document.getElementById('senha-login').value;

      try {
        const res = await API.request('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: emailDigitado, senha: senha })
        });

        API.setToken(res.access_token);
        API.setUser(res.user);

        showToast('Login efetuado com sucesso!', 'success');
        atualizarEstadoUsuario();
      } catch (err) {
        showToast('Senha incorreta ou erro ao entrar.', 'error');
      }
    });
  }

  // Formulário C: Cadastro
  if (formAuthRegister) {
    formAuthRegister.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = document.getElementById('nome-reg').value;
      const cpf = document.getElementById('cpf-reg').value;
      const telefone = document.getElementById('telefone-reg').value;
      const senha = document.getElementById('senha-reg').value;

      try {
        // Criar usuário
        await API.request('/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            nome,
            email: emailDigitado,
            cpf,
            telefone,
            senha
          })
        });

        // Autenticar automaticamente
        const loginRes = await API.request('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: emailDigitado, senha })
        });

        API.setToken(loginRes.access_token);
        API.setUser(loginRes.user);

        showToast('Conta criada com sucesso!', 'success');
        atualizarEstadoUsuario();
      } catch (err) {
        showToast(err.message || 'Erro ao realizar cadastro.', 'error');
      }
    });
  }

  // --- SUBMETER INSCRIÇÃO & PAGAMENTO (ETAPA 2) ---
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
            num_parcelas: numParcelas,
            data_primeira_parcela: formaPagamento === 'PARCELADO' ? document.getElementById('data_primeira_parcela').value : null
          })
        });

        step2.style.display = 'none';
        step3.style.display = 'block';
        if (loggedUserBanner) loggedUserBanner.style.display = 'none';

        renderPaymentResult(pagamento, formaPagamento);
        showToast('Inscrição e pagamento gerados com sucesso!', 'success');

      } catch (err) {
        showToast(err.message || 'Erro ao processar inscrição.', 'error');
      }
    });
  }

  function atualizarEstadoUsuario() {
    const user = API.getUser();
    const token = API.getToken();

    if (user && token) {
      if (loggedUserBanner) {
        loggedUserBanner.style.display = 'flex';
        loggedUserMsg.innerHTML = `Participante ativo: <strong>${user.nome}</strong> (${user.email})`;
      }
      step1.style.display = 'none';
      step2.style.display = 'block';
    } else {
      if (loggedUserBanner) {
        loggedUserBanner.style.display = 'none';
      }
      step1.style.display = 'block';
      step2.style.display = 'none';
      
      // Resetar visibilidade dos formulários
      if (formEmailCheck) formEmailCheck.style.display = 'block';
      if (formAuthLogin) formAuthLogin.style.display = 'none';
      if (formAuthRegister) formAuthRegister.style.display = 'none';
      
      // Limpar campos
      if (formEmailCheck) formEmailCheck.reset();
      if (formAuthLogin) formAuthLogin.reset();
      if (formAuthRegister) formAuthRegister.reset();
    }
  }

  // Permite deslogar para cadastrar outra pessoa
  window.deslogarWizard = function () {
    API.removeToken();
    showToast('Sessão encerrada para novo participante.', 'info');
    atualizarEstadoUsuario();
  };

  window.voltarParaEmail = function () {
    if (formAuthLogin) formAuthLogin.style.display = 'none';
    if (formAuthRegister) formAuthRegister.style.display = 'none';
    if (formEmailCheck) {
      formEmailCheck.style.display = 'block';
      document.getElementById('email-verify').focus();
    }
  };

  function renderPaymentResult(pagamento, forma) {
    const userAreaUrl = 'https://usuariosinodalpb.netlify.app/dashboard.html';

    if (forma === 'PIX') {
      const isUrl = pagamento.copia_cola_pix && (pagamento.copia_cola_pix.startsWith('http://') || pagamento.copia_cola_pix.startsWith('https://'));
      if (isUrl) {
        paymentResult.innerHTML = `
          <div style="text-align: center; padding: 1.5rem;">
            <div class="badge badge-warning" style="margin-bottom: 1rem;">Pagamento Pendente</div>
            <h3>Conclua seu pagamento Pix clicando no link abaixo:</h3>
            <a href="${pagamento.copia_cola_pix}" target="_blank" class="btn btn-primary" style="margin: 1.5rem 0; font-size: 1.1rem; display: inline-block;">
              💸 Pagar via Pix (InfinitePay)
            </a>
            ${pagamento.qr_code_pix ? `
              <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 1rem;">Ou escaneie o QR Code abaixo:</p>
              <img src="${pagamento.qr_code_pix}" alt="QR Code" style="max-width: 200px; margin: 1rem 0; border: 1px solid #ddd; padding: 10px; border-radius: 8px;" />
            ` : `
              <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 1rem;">Você será redirecionado para a página segura da InfinitePay.</p>
            `}
            <br>
            <a href="${userAreaUrl}" class="btn btn-outline" style="margin-top: 1.5rem; display: inline-block;">Ir para Minha Área</a>
          </div>
        `;
      } else {
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
      }
    } else if (forma === 'INFINITEPAY') {
      paymentResult.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
          <div class="badge badge-success" style="margin-bottom: 1rem;">Checkout InfinitePay Gerado</div>
          <h3>Clique no botão abaixo para concluir o pagamento via Pix ou Cartão:</h3>
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
            <a href="${API_BASE_URL}/pagamentos/parcelas/${p.id}/pdf?token=${API.getToken()}" target="_blank" class="btn btn-outline" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;">
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
