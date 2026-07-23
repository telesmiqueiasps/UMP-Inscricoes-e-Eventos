let eventoAtual = null;

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

  let emailDigitado = '';

  // 1. Carregar detalhes do Evento
  try {
    eventoAtual = await API.request(`/eventos/publico/${eventoId}`);

    const isSoldOut = eventoAtual.max_participantes && eventoAtual.vagas_restantes === 0;
    if (isSoldOut) {
      eventSummary.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
          <h2 style="font-size: 1.5rem; font-weight: 700; color: #EF4444;">Vagas Esgotadas!</h2>
          <p style="color: var(--text-muted); margin-top: 0.5rem;">As vagas para o evento <strong>${eventoAtual.titulo}</strong> já foram preenchidas.</p>
          <a href="index.html" class="btn btn-outline" style="margin-top: 1.5rem; display: inline-block;">Voltar para Página Inicial</a>
        </div>
      `;
      return;
    }

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

      // Coletar campos dinâmicos para enviar em dados_extras
      const dadosExtras = {};
      document.querySelectorAll('.dyn-input').forEach(input => {
        const name = input.name.replace('dyn_', '');
        dadosExtras[name] = input.value;
      });

      try {
        // 1. Criar Inscrição
        const inscricao = await API.request('/inscricoes', {
          method: 'POST',
          body: JSON.stringify({
            evento_id: parseInt(eventoId),
            forma_pagamento: formaPagamento,
            num_parcelas: numParcelas,
            dados_extras: dadosExtras
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
      renderDynamicFormFields();
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

function renderDynamicFormFields() {
  const listContainer = document.getElementById('dynamic-fields-list');
  const container = document.getElementById('dynamic-fields-container');
  if (!listContainer || !container || !eventoAtual) return;

  const fieldsStr = eventoAtual.campos_formulario;
  if (!fieldsStr) {
    container.style.display = 'none';
    listContainer.innerHTML = '';
    return;
  }

  const fields = fieldsStr.split(',').filter(f => f.trim() !== '');
  if (fields.length === 0) {
    container.style.display = 'none';
    listContainer.innerHTML = '';
    return;
  }

  container.style.display = 'block';
  
  // Mapeia cada campo dinâmico habilitado para seu HTML correspondente
  listContainer.innerHTML = fields.map(field => {
    let fieldHTML = '';
    
    switch (field) {
      case 'cpf':
        fieldHTML = `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">CPF *</label>
            <input type="text" name="dyn_cpf" class="form-control dyn-input" placeholder="000.000.000-00" required>
          </div>
        `;
        break;
      case 'telefone':
        fieldHTML = `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Telefone / WhatsApp *</label>
            <input type="text" name="dyn_telefone" class="form-control dyn-input" placeholder="(83) 99999-9999" required>
          </div>
        `;
        break;
      case 'data_nascimento':
        fieldHTML = `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Data de Nascimento *</label>
            <input type="date" name="dyn_data_nascimento" class="form-control dyn-input" required>
          </div>
        `;
        break;
      case 'genero':
        fieldHTML = `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Gênero *</label>
            <select name="dyn_genero" class="form-control dyn-input" required>
              <option value="">Selecione...</option>
              <option value="Masculino">Masculino</option>
              <option value="Feminino">Feminino</option>
              <option value="Outro">Outro</option>
            </select>
          </div>
        `;
        break;
      case 'tamanho_camiseta':
        fieldHTML = `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Tamanho da Camiseta *</label>
            <select name="dyn_tamanho_camiseta" class="form-control dyn-input" required>
              <option value="">Selecione...</option>
              <option value="PP">PP</option>
              <option value="P">P</option>
              <option value="M">M</option>
              <option value="G">G</option>
              <option value="GG">GG</option>
              <option value="XG">XG</option>
              <option value="XXG">XXG</option>
            </select>
          </div>
        `;
        break;
      case 'tipo_sanguineo':
        fieldHTML = `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Tipo Sanguíneo *</label>
            <select name="dyn_tipo_sanguineo" class="form-control dyn-input" required>
              <option value="">Selecione...</option>
              <option value="A+">A+</option>
              <option value="A-">A-</option>
              <option value="B+">B+</option>
              <option value="B-">B-</option>
              <option value="AB+">AB+</option>
              <option value="AB-">AB-</option>
              <option value="O+">O+</option>
              <option value="O-">O-</option>
            </select>
          </div>
        `;
        break;
      case 'alergias':
        fieldHTML = `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Possui Alergias? (Se sim, descreva) *</label>
            <input type="text" name="dyn_alergias" class="form-control dyn-input" placeholder="Ex: Não, ou Sim (Dipirona)" required>
          </div>
        `;
        break;
      case 'medicamento_continuo':
        fieldHTML = `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Toma algum Medicamento Contínuo? (Se sim, descreva) *</label>
            <input type="text" name="dyn_medicamento_continuo" class="form-control dyn-input" placeholder="Ex: Não, ou Sim (Rivotril)" required>
          </div>
        `;
        break;
      case 'contato_emergencia':
        fieldHTML = `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Contato de Emergência (Nome e Telefone) *</label>
            <input type="text" name="dyn_contato_emergencia" class="form-control dyn-input" placeholder="Ex: Maria (Mãe) - (83) 99999-9999" required>
          </div>
        `;
        break;
      case 'restricao_alimentar':
        fieldHTML = `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Restrição Alimentar *</label>
            <select name="dyn_restricao_alimentar" class="form-control dyn-input" required>
              <option value="Nenhuma">Nenhuma</option>
              <option value="Vegetariano">Vegetariano</option>
              <option value="Vegano">Vegano</option>
              <option value="Sem Glúten">Sem Glúten</option>
              <option value="Sem Lactose">Sem Lactose</option>
              <option value="Outros">Outros</option>
            </select>
          </div>
        `;
        break;
      case 'igreja':
        fieldHTML = `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Igreja / Congregação *</label>
            <input type="text" name="dyn_igreja" class="form-control dyn-input" placeholder="Ex: IPB Sousa" required>
          </div>
        `;
        break;
      case 'cargo_ump':
        fieldHTML = `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Federação / Cargo na UMP *</label>
            <input type="text" name="dyn_cargo_ump" class="form-control dyn-input" placeholder="Ex: Federação Oeste / Membro" required>
          </div>
        `;
        break;
    }

    return fieldHTML;
  }).join('');

  // Pré-preenchimento
  const user = API.getUser();
  if (user) {
    const cpfInput = document.querySelector('input[name="dyn_cpf"]');
    if (cpfInput) cpfInput.value = user.cpf || '';
    const foneInput = document.querySelector('input[name="dyn_telefone"]');
    if (foneInput) foneInput.value = user.telefone || '';
  }
}
