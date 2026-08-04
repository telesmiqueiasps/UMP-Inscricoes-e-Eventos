let eventoAtual = null;

function isVideoUrl(url) {
  if (!url) return false;
  const cleanUrl = url.split('?')[0].toLowerCase();
  return cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.webm') || cleanUrl.endsWith('.mov') || cleanUrl.endsWith('.avi');
}

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const eventoId = urlParams.get('evento_id');

  const step1 = document.getElementById('step-1');
  const step2 = document.getElementById('step-2');
  const step3 = document.getElementById('step-3');
  const step4 = document.getElementById('step-4');

  const loggedUserBanner = document.getElementById('logged-user-banner');
  const loggedUserMsg = document.getElementById('logged-user-msg');

  const eventSummary = document.getElementById('event-summary');
  
  // Formulários da Etapa 1
  const formEmailCheck = document.getElementById('form-email-check');
  const formAuthLogin = document.getElementById('form-auth-login');
  const formAuthRegister = document.getElementById('form-auth-register');

  // Formulário da Etapa 2
  const formDadosExtras = document.getElementById('form-dados-extras');

  // Formulário da Etapa 3
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
  let dadosExtrasSalvos = {};

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

    const fotosList = eventoAtual.fotos ? eventoAtual.fotos.split(',').filter(f => f.trim() !== '') : [];
    const bannerUrl = fotosList.find(url => !isVideoUrl(url)) || fotosList[0];
    let imageHTML = '';
    if (bannerUrl) {
      if (isVideoUrl(bannerUrl)) {
        imageHTML = `<video src="${bannerUrl}" autoplay muted loop style="width: calc(100% + 3rem); height: 220px; object-fit: cover; border-radius: var(--radius-md) var(--radius-md) 0 0; margin: -1.5rem -1.5rem 1.5rem -1.5rem; display: block;"></video>`;
      } else {
        imageHTML = `<img src="${bannerUrl}" alt="${eventoAtual.titulo}" style="width: calc(100% + 3rem); height: 220px; object-fit: cover; border-radius: var(--radius-md) var(--radius-md) 0 0; margin: -1.5rem -1.5rem 1.5rem -1.5rem; display: block;" />`;
      }
    }

    eventSummary.innerHTML = `
      ${imageHTML}
      <div style="padding: 0 0.5rem;">
        <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem;">${eventoAtual.titulo}</h2>
        <div class="card-desc" style="margin-bottom: 0.75rem;">${eventoAtual.descricao || ''}</div>
        <div style="font-size: 1.25rem; font-weight: 800; color: var(--primary);">
          Valor Total: R$ ${parseFloat(eventoAtual.valor).toFixed(2).replace('.', ',')}
        </div>
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

  // --- SUBMETER DADOS DA INSCRIÇÃO (ETAPA 2) ---
  if (formDadosExtras) {
    formDadosExtras.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const estadiaHidden = document.getElementById('hidden-dias-estadia');
      if (estadiaHidden) {
        const selectedDays = Array.from(document.querySelectorAll('.estadia-day:checked')).map(cb => cb.value).join(', ');
        estadiaHidden.value = selectedDays;
        if (!selectedDays) {
          showToast('Por favor, selecione pelo menos um dia de estadia.', 'error');
          return;
        }
      }

      // Coletar campos dinâmicos e salvar localmente
      dadosExtrasSalvos = {};
      document.querySelectorAll('.dyn-input').forEach(input => {
        const name = input.name.replace('dyn_', '');
        dadosExtrasSalvos[name] = input.value;
      });

      // Avançar para Etapa 3 (Pagamento)
      step2.style.display = 'none';
      step3.style.display = 'block';
    });
  }

  // --- SUBMETER TRIAGEM & PAGAMENTO (ETAPA 3) ---
  if (formPagamento) {
    formPagamento.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formaPagamento = document.querySelector('input[name="forma_pagamento"]:checked').value;
      const numParcelas = parseInt(numParcelasSelect.value) || 1;
      const dataPrimeira = formaPagamento === 'PARCELADO' ? document.getElementById('data_primeira_parcela').value : null;

      try {
        // 1. Criar/Atualizar Triagem de Inscrição
        const triagem = await API.request('/inscricoes/triagem', {
          method: 'POST',
          body: JSON.stringify({
            evento_id: parseInt(eventoId),
            forma_pagamento: formaPagamento,
            num_parcelas: numParcelas,
            data_primeira_parcela: dataPrimeira,
            dados_extras: dadosExtrasSalvos
          })
        });

        // 2. Processar Checkout da Triagem
        const pagamentoRes = await API.request('/pagamentos/processar-triagem', {
          method: 'POST',
          body: JSON.stringify({
            triagem_id: triagem.id
          })
        });

        step3.style.display = 'none';
        step4.style.display = 'block';
        if (loggedUserBanner) loggedUserBanner.style.display = 'none';

        renderPaymentResult(pagamentoRes, formaPagamento);
        showToast('Resumo de pagamento gerado! Conclua o pagamento para confirmar sua vaga.', 'success');

      } catch (err) {
        showToast(err.message || 'Erro ao processar checkout.', 'error');
      }
    });
  }

  // --- NAVEGAÇÃO DO WIZARD ---
  window.voltarParaIdentificacao = function() {
    deslogarWizard();
  };

  window.voltarParaDados = function() {
    step3.style.display = 'none';
    step2.style.display = 'block';
  };

  async function atualizarEstadoUsuario() {
    const user = API.getUser();
    const token = API.getToken();

    if (user && token) {
      if (loggedUserBanner) {
        loggedUserBanner.style.display = 'flex';
        loggedUserMsg.innerHTML = `Participante ativo: <strong>${user.nome}</strong> (${user.email})`;
      }
      step1.style.display = 'none';
      step2.style.display = 'block';
      step3.style.display = 'none';
      step4.style.display = 'none';
      renderDynamicFormFields();

      // Checar se possui triagem pendente
      try {
        const triagem = await API.request(`/inscricoes/triagem/pendente?evento_id=${eventoId}`);
        if (triagem) {
          exibirAvisoTriagem(triagem);
        }
      } catch (e) {}
    } else {
      if (loggedUserBanner) {
        loggedUserBanner.style.display = 'none';
      }
      step1.style.display = 'block';
      step2.style.display = 'none';
      step3.style.display = 'none';
      step4.style.display = 'none';
      
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

  function exibirAvisoTriagem(triagem) {
    let banner = document.getElementById('triagem-banner-msg');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'triagem-banner-msg';
      banner.style.cssText = 'background: #FEF3C7; border: 1.5px solid #F59E0B; border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1.5rem; text-align: left;';
      const step2Card = document.getElementById('step-2');
      if (step2Card) {
        step2Card.insertBefore(banner, step2Card.firstChild);
      }
    }

    banner.innerHTML = `
      <div style="color: #92400E; font-weight: 700; font-size: 1.05rem; margin-bottom: 0.25rem;">
        ⏳ Proposta de inscrição em andamento
      </div>
      <p style="color: #78350F; font-size: 0.88rem; margin-bottom: 0.75rem;">
        Identificamos que você iniciou o processo de inscrição para este evento anteriormente. Deseja retomar o pagamento?
      </p>
      <div style="display: flex; gap: 0.5rem;">
        <button type="button" class="btn btn-primary" style="font-size: 0.85rem; padding: 0.4rem 0.8rem;" onclick="retomarTriagem()">
          Retomar Pagamento &rarr;
        </button>
        <button type="button" class="btn btn-outline" style="font-size: 0.85rem; padding: 0.4rem 0.8rem;" onclick="ignorarTriagem()">
          Recomeçar do Zero
        </button>
      </div>
    `;

    window.retomarTriagem = function() {
      if (triagem.dados_extras) {
        dadosExtrasSalvos = triagem.dados_extras;
        Object.keys(triagem.dados_extras).forEach(k => {
          const inp = document.querySelector(`[name="dyn_${k}"]`);
          if (inp) inp.value = triagem.dados_extras[k];
        });
      }
      if (triagem.forma_pagamento) {
        const radio = document.querySelector(`input[name="forma_pagamento"][value="${triagem.forma_pagamento}"]`);
        if (radio) {
          radio.checked = true;
          radio.dispatchEvent(new Event('change'));
        }
      }
      step2.style.display = 'none';
      step3.style.display = 'block';
    };

    window.ignorarTriagem = function() {
      if (banner) banner.style.display = 'none';
    };
  }

  function renderPaymentResult(pagamento, forma) {
    const userAreaUrl = 'https://usuariosinodalpb.netlify.app/dashboard.html';

    const infoAvisoHtml = `
      <div style="background: #EFF6FF; border: 1.5px solid #60A5FA; border-radius: var(--radius-md); padding: 1rem; margin-top: 1.5rem; text-align: left;">
        <strong style="color: #1E40AF; display: block; margin-bottom: 0.25rem;">ℹ️ Confirmação da Vaga</strong>
        <span style="font-size: 0.85rem; color: #1E3A8A;">Sua vaga e sua inscrição serão oficializadas no sistema assim que o pagamento (ou a 1ª parcela) for identificado pelo nosso sistema.</span>
      </div>
    `;

    if (forma === 'PIX') {
      const isUrl = pagamento.copia_cola_pix && (pagamento.copia_cola_pix.startsWith('http://') || pagamento.copia_cola_pix.startsWith('https://'));
      if (isUrl) {
        paymentResult.innerHTML = `
          <div style="text-align: center; padding: 1.5rem;">
            <div class="badge badge-warning" style="margin-bottom: 1rem;">Aguardando Pagamento</div>
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
            ${infoAvisoHtml}
            <br>
            <a href="${userAreaUrl}" class="btn btn-outline" style="margin-top: 1rem; display: inline-block;">Ir para Minha Área</a>
          </div>
        `;
      } else {
        paymentResult.innerHTML = `
          <div style="text-align: center;">
            <div class="badge badge-warning" style="margin-bottom: 1rem;">Aguardando Pagamento</div>
            <h3>Escaneie o QR Code abaixo para pagar via Pix:</h3>
            <img src="${pagamento.qr_code_pix}" alt="QR Code Pix" style="max-width: 240px; margin: 1.5rem 0; border: 1px solid #ddd; padding: 10px; border-radius: 8px;" />
            
            <div class="form-group" style="text-align: left;">
              <label class="form-label">Pix Copia e Cola:</label>
              <input type="text" readonly class="form-control" value="${pagamento.copia_cola_pix}" id="pix-input" />
              <button class="btn btn-outline" style="width: 100%; margin-top: 0.5rem;" onclick="copiarPix()">Copiar Código Pix</button>
            </div>
            ${infoAvisoHtml}
            <a href="${userAreaUrl}" class="btn btn-primary" style="margin-top: 1rem; width: 100%;">Ir para Minha Área</a>
          </div>
        `;
      }
    } else if (forma === 'INFINITEPAY') {
      paymentResult.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
          <div class="badge badge-warning" style="margin-bottom: 1rem;">Aguardando Pagamento</div>
          <h3>Clique no botão abaixo para concluir o pagamento via Pix ou Cartão:</h3>
          <a href="${pagamento.receipt_url}" target="_blank" class="btn btn-primary" style="margin: 1.5rem 0; font-size: 1.1rem;">
            💳 Pagar na InfinitePay
          </a>
          ${infoAvisoHtml}
          <br>
          <a href="${userAreaUrl}" class="btn btn-outline">Ir para Minha Área</a>
        </div>
      `;
    } else if (forma === 'PARCELADO') {
      const primeiraParcela = (pagamento.parcelas || [])[0];
      const valorFmt = primeiraParcela ? `R$ ${parseFloat(primeiraParcela.valor).toFixed(2).replace('.', ',')}` : '';
      const vencFmt = primeiraParcela ? new Date(primeiraParcela.vencimento + (primeiraParcela.vencimento.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('pt-BR') : '';

      const pdfUrl = primeiraParcela && primeiraParcela.pdf_url ? `${API_BASE_URL}${primeiraParcela.pdf_url}?token=${API.getToken()}` : null;
      const checkoutUrl = primeiraParcela && primeiraParcela.copia_cola_pix && primeiraParcela.copia_cola_pix.startsWith('http') ? primeiraParcela.copia_cola_pix : null;
      const qrCodeImg = primeiraParcela ? primeiraParcela.qr_code_pix : null;

      let qrHtml = '';
      if (qrCodeImg) {
        qrHtml = `
          <div style="margin: 1.5rem 0; text-align: center;">
            <p style="font-weight: 600; font-size: 0.9rem; color: var(--text-color); margin-bottom: 0.5rem;">
              📱 Escaneie o QR Code abaixo com a câmera do seu celular para ir ao checkout:
            </p>
            <img src="${qrCodeImg}" alt="QR Code 1ª Parcela" style="max-width: 210px; border: 1px solid #ddd; padding: 10px; border-radius: 12px; background: white;" />
          </div>
        `;
      }

      let acoesHtml = '';
      if (checkoutUrl) {
        acoesHtml += `
          <a href="${checkoutUrl}" target="_blank" class="btn btn-primary" style="margin-bottom: 0.75rem; font-size: 1.05rem; width: 100%; display: block; padding: 0.85rem;">
            💳 Pagar 1ª Parcela no Checkout (InfinitePay) &rarr;
          </a>
        `;
      }

      if (pdfUrl) {
        acoesHtml += `
          <a href="${pdfUrl}" target="_blank" class="btn btn-outline" style="margin-bottom: 0.75rem; font-size: 1rem; width: 100%; display: block; border-color: var(--primary); color: var(--primary); font-weight: 600; padding: 0.75rem;">
            📄 Baixar Carnê / PDF da 1ª Parcela
          </a>
        `;
      }

      let pixCopiaColaHtml = '';
      if (primeiraParcela && primeiraParcela.copia_cola_pix) {
        pixCopiaColaHtml = `
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 1rem; border-radius: 8px; margin: 1rem 0; text-align: left;">
            <strong style="color: #334155; font-size: 0.85rem;">Link / Chave Pix da 1ª Parcela:</strong>
            <input type="text" readonly class="form-control" value="${primeiraParcela.copia_cola_pix}" id="pix-input-parc1" style="margin-top: 0.5rem; font-size: 0.85rem;" />
            <button class="btn btn-outline" style="width: 100%; margin-top: 0.5rem; font-size: 0.85rem;" onclick="copiarPixParc1()">Copiar Link / Código Pix</button>
          </div>
        `;
      }

      paymentResult.innerHTML = `
        <div style="text-align: center; padding: 0.5rem 0;">
          <div class="badge badge-warning" style="margin-bottom: 1rem;">Aguardando 1ª Parcela</div>
          <h3 style="font-size: 1.35rem; font-weight: 700;">1ª Parcela - Confirmação da Inscrição</h3>
          <p style="color: var(--text-muted); margin-top: 0.5rem; font-size: 0.9rem;">
            Efetue o pagamento da 1ª parcela até <strong>${vencFmt}</strong> para garantir sua vaga e oficializar sua inscrição.
          </p>

          <div style="background: #FAF5FF; border: 1.5px solid #C084FC; border-radius: var(--radius-md); padding: 1.25rem; margin: 1.5rem 0; text-align: center;">
            <div style="font-size: 0.85rem; color: #6B21A8; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Valor da 1ª Parcela (Confirmação)</div>
            <div style="font-size: 2.2rem; font-weight: 800; color: #581C87; margin: 0.25rem 0;">${valorFmt}</div>
            <div style="font-size: 0.85rem; color: #7E22CE;">Vencimento: <strong>${vencFmt}</strong></div>
          </div>

          ${qrHtml}

          ${acoesHtml}

          ${pixCopiaColaHtml}

          ${infoAvisoHtml}

          <a href="${userAreaUrl}" class="btn btn-outline" style="margin-top: 1.5rem; width: 100%; display: inline-block;">Ir para Minha Área</a>
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

function copiarPixParc1() {
  const input = document.getElementById('pix-input-parc1');
  if (input) {
    input.select();
    navigator.clipboard.writeText(input.value);
    showToast('Código Pix da 1ª parcela copiado!', 'success');
  }
}

function formatarCPF(value) {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
    .substring(0, 14);
}

function formatarTelefone(value) {
  return value
    .replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/g, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .substring(0, 15);
}

document.addEventListener('input', (e) => {
  if (e.target.id === 'cpf-reg' || e.target.name === 'dyn_cpf') {
    e.target.value = formatarCPF(e.target.value);
  }
  if (e.target.id === 'telefone-reg' || e.target.name === 'dyn_telefone' || e.target.name === 'dyn_contato_pastor') {
    e.target.value = formatarTelefone(e.target.value);
  }
});

function renderDynamicFormFields() {
  const listContainer = document.getElementById('dynamic-fields-list');
  const container = document.getElementById('dynamic-fields-container');
  const noFieldsMsg = document.getElementById('no-fields-msg');
  if (!listContainer || !container || !eventoAtual) return;

  const fieldsStr = eventoAtual.campos_formulario;
  if (!fieldsStr) {
    container.style.display = 'none';
    listContainer.innerHTML = '';
    if (noFieldsMsg) noFieldsMsg.style.display = 'block';
    return;
  }

  const fields = fieldsStr.split(',').filter(f => f.trim() !== '');
  if (fields.length === 0) {
    container.style.display = 'none';
    listContainer.innerHTML = '';
    if (noFieldsMsg) noFieldsMsg.style.display = 'block';
    return;
  }

  container.style.display = 'block';
  if (noFieldsMsg) noFieldsMsg.style.display = 'none';
  
  listContainer.innerHTML = fields.map(field => {
    let fieldHTML = '';
    
    switch (field) {
      case 'cpf':
        fieldHTML = `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">CPF *</label>
            <input type="text" name="dyn_cpf" class="form-control dyn-input" placeholder="000.000.000-00" required pattern="^\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}$" title="Digite o CPF no formato 000.000.000-00">
          </div>
        `;
        break;
      case 'telefone':
        fieldHTML = `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Telefone / WhatsApp *</label>
            <input type="text" name="dyn_telefone" class="form-control dyn-input" placeholder="(00) 00000-0000" required pattern="^\\(\\d{2}\\)\\s\\d{5}-\\d{4}$" title="Digite o telefone no formato (00) 00000-0000">
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
            <input type="text" name="dyn_contato_emergencia" class="form-control dyn-input" placeholder="Ex: Maria (Mãe) - (00) 00000-0000" required>
          </div>
        `;
        break;
      case 'restricao_alimentar':
        fieldHTML = `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Restrição Alimentar (Se houver, descreva) *</label>
            <input type="text" name="dyn_restricao_alimentar" class="form-control dyn-input" placeholder="Ex: Nenhuma, ou Alergia a glúten" required>
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
      case 'presbiterio':
        fieldHTML = `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Presbitério *</label>
            <select name="dyn_presbiterio" id="dyn-select-presbiterio" class="form-control dyn-input" required>
              <option value="">Carregando presbitérios...</option>
            </select>
          </div>
        `;
        break;
      case 'cidade':
        fieldHTML = `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Cidade *</label>
            <input type="text" name="dyn_cidade" class="form-control dyn-input" placeholder="Sua cidade" required>
          </div>
        `;
        break;
      case 'estado_civil':
        fieldHTML = `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Estado Civil *</label>
            <select name="dyn_estado_civil" class="form-control dyn-input" required>
              <option value="">Selecione...</option>
              <option value="Solteiro(a)">Solteiro(a)</option>
              <option value="Casado(a)">Casado(a)</option>
              <option value="Divorciado(a)">Divorciado(a)</option>
              <option value="Viúvo(a)">Viúvo(a)</option>
            </select>
          </div>
        `;
        break;
      case 'nome_pastor':
        fieldHTML = `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Nome do seu Pastor *</label>
            <input type="text" name="dyn_nome_pastor" class="form-control dyn-input" placeholder="Nome completo do pastor" required>
          </div>
        `;
        break;
      case 'contato_pastor':
        fieldHTML = `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Contato do seu Pastor *</label>
            <input type="text" name="dyn_contato_pastor" class="form-control dyn-input" placeholder="(00) 00000-0000" required pattern="^\\(\\d{2}\\)\\s\\d{5}-\\d{4}$" title="Digite o telefone no formato (00) 00000-0000">
          </div>
        `;
        break;
      case 'cargo_federacao':
        fieldHTML = `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Cargo na Federação *</label>
            <input type="text" name="dyn_cargo_federacao" class="form-control dyn-input" placeholder="Ex: Membro, Presidente..." required>
          </div>
        `;
        break;
      case 'dias_estadia':
        const startISO = (eventoAtual.data_inicio || '').split('T')[0];
        const endISO = (eventoAtual.data_fim || '').split('T')[0];
        fieldHTML = `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Dia da sua chegada *</label>
            <input type="date" name="dyn_dias_estadia" class="form-control dyn-input" min="${startISO}" max="${endISO}" required>
          </div>
        `;
        break;
    }

    return fieldHTML;
  }).join('');

  // Carregar Presbitérios se houver o campo presbiterio
  const selectPresb = document.getElementById('dyn-select-presbiterio');
  if (selectPresb) {
    API.request('/presbiterios').then(data => {
      selectPresb.innerHTML = '<option value="">Selecione...</option>' + 
        data.map(p => `<option value="${p.nome}">${p.nome}</option>`).join('');
    }).catch(err => {
      selectPresb.innerHTML = '<option value="">Erro ao carregar presbitérios</option>';
    });
  }

  // Pré-preenchimento
  const user = API.getUser();
  if (user) {
    const cpfInput = document.querySelector('input[name="dyn_cpf"]');
    if (cpfInput) cpfInput.value = user.cpf || '';
    const foneInput = document.querySelector('input[name="dyn_telefone"]');
    if (foneInput) foneInput.value = user.telefone || '';
  }
}
