let eventoAtual = null;
let diasConfig = [];
let diasSelecionados = [];
let dadosExtrasSalvos = {};
let valorTotalCalculado = 0;

function isVideoUrl(url) {
  if (!url) return false;
  const cleanUrl = url.split('?')[0].toLowerCase();
  return cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.webm') || cleanUrl.endsWith('.mov') || cleanUrl.endsWith('.avi');
}

function formatarDataIso(isoStr) {
  if (!isoStr) return '';
  const dateOnly = isoStr.split('T')[0];
  const parts = dateOnly.split('-');
  if (parts.length === 3) {
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const diaFmt = String(parts[2]).padStart(2, '0');
    const mesFmt = String(parts[1]).padStart(2, '0');
    const anoFmt = parts[0];
    return `${diaFmt}/${mesFmt}/${anoFmt} (${diasSemana[d.getDay()]})`;
  }
  return isoStr;
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
  const formDiariaDados = document.getElementById('form-diaria-dados');

  if (!eventoId) {
    showToast('Nenhum evento selecionado.', 'error');
    setTimeout(() => window.location.href = 'index.html', 2000);
    return;
  }

  let emailDigitado = '';

  // Validação imediata do estado de autenticação para evitar flash de tela
  atualizarEstadoUsuario();

  // 1. Carregar Configuração de Diárias do Evento
  try {
    const res = await API.request(`/diarias/evento/${eventoId}/config`);
    eventoAtual = res;

    if (!eventoAtual.diarias_habilitadas) {
      eventSummary.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
          <h2 style="font-size: 1.5rem; font-weight: 700; color: #EF4444;">Diárias Indisponíveis</h2>
          <p style="color: var(--text-muted); margin-top: 0.5rem;">As diárias avulsas não estão habilitadas para o evento <strong>${eventoAtual.titulo}</strong>.</p>
          <a href="evento.html?id=${eventoId}" class="btn btn-outline" style="margin-top: 1.5rem; display: inline-block;">Ver Detalhes do Evento</a>
        </div>
      `;
      return;
    }

    // Configuração dos dias
    const configRaw = eventoAtual.config_diarias || {};
    const config = typeof configRaw === 'string' ? JSON.parse(configRaw) : configRaw;
    diasConfig = Array.isArray(config.dias) ? config.dias : [];

    if (diasConfig.length === 0) {
      eventSummary.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
          <h2 style="font-size: 1.5rem; font-weight: 700; color: #EF4444;">Nenhuma data configurada</h2>
          <p style="color: var(--text-muted); margin-top: 0.5rem;">A organização do evento ainda não liberou os dias para venda de diárias.</p>
          <a href="evento.html?id=${eventoId}" class="btn btn-outline" style="margin-top: 1.5rem; display: inline-block;">Voltar para o Evento</a>
        </div>
      `;
      return;
    }

    // Renderizar resumo do evento
    const fotosList = eventoAtual.fotos ? eventoAtual.fotos.split(',').filter(f => f.trim() !== '') : [];
    const bannerUrl = fotosList.find(url => !isVideoUrl(url)) || fotosList[0];
    let imageHTML = '';
    if (bannerUrl) {
      if (isVideoUrl(bannerUrl)) {
        imageHTML = `<video src="${bannerUrl}" autoplay muted loop style="width: calc(100% + 3rem); height: 200px; object-fit: cover; border-radius: var(--radius-md) var(--radius-md) 0 0; margin: -1.5rem -1.5rem 1.5rem -1.5rem; display: block;"></video>`;
      } else {
        imageHTML = `<img src="${bannerUrl}" alt="${eventoAtual.titulo}" style="width: calc(100% + 3rem); height: 200px; object-fit: cover; border-radius: var(--radius-md) var(--radius-md) 0 0; margin: -1.5rem -1.5rem 1.5rem -1.5rem; display: block;" />`;
      }
    }

    eventSummary.innerHTML = `
      ${imageHTML}
      <div style="padding: 0 0.5rem;">
        <div style="margin-bottom: 0.5rem;">
          <span class="diaria-badge">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
            Inscrição por Diária
          </span>
        </div>
        <h2 style="font-size: 1.5rem; font-weight: 800; color: #1E293B; margin-bottom: 0.4rem;">${eventoAtual.titulo}</h2>
        <p style="color: var(--text-muted); font-size: 0.9rem; line-height: 1.4; margin-bottom: 0.5rem;">${eventoAtual.descricao || ''}</p>
        <div style="font-size: 0.85rem; color: #64748B;">
          📍 Local: <strong>${eventoAtual.local || 'A definir'}</strong>
        </div>
      </div>
    `;

    // Renderizar observações/orientações se configurado pelo admin
    const observacaoContainer = document.getElementById('diaria-observacao-container');
    const observacaoTexto = document.getElementById('diaria-observacao-texto');
    const observacao = config.observacao !== undefined ? config.observacao : (config.descricao || '');
    if (observacaoContainer && observacaoTexto) {
      if (observacao && observacao.trim()) {
        observacaoTexto.textContent = observacao.trim();
        observacaoContainer.style.display = 'block';
      } else {
        observacaoContainer.style.display = 'none';
      }
    }

    // Renderizar Checklist de Dias
    renderChecklistDias();

  } catch (err) {
    eventSummary.innerHTML = `<p style="color:red; padding: 1rem;">Erro ao carregar detalhes das diárias do evento.</p>`;
    return;
  }

  // 2. Atualizar UI de autenticação
  atualizarEstadoUsuario();

  // --- FLUXO ETAPA 1 (Identificação) ---
  if (formEmailCheck) {
    formEmailCheck.addEventListener('submit', async (e) => {
      e.preventDefault();
      emailDigitado = document.getElementById('email-verify').value.trim();
      if (!emailDigitado) return;

      try {
        const res = await API.request(`/auth/check-email?email=${encodeURIComponent(emailDigitado)}`);
        
        formEmailCheck.style.display = 'none';
        if (res.exists) {
          formAuthLogin.style.display = 'block';
          formAuthRegister.style.display = 'none';
          document.getElementById('senha-login').focus();
        } else {
          formAuthLogin.style.display = 'none';
          formAuthRegister.style.display = 'block';
          document.getElementById('nome-reg').focus();
        }
      } catch (err) {
        showToast('Erro ao validar e-mail.', 'error');
      }
    });
  }

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

  if (formAuthRegister) {
    formAuthRegister.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = document.getElementById('nome-reg').value;
      const cpf = document.getElementById('cpf-reg').value;
      const telefone = document.getElementById('telefone-reg').value;
      const senha = document.getElementById('senha-reg').value;

      try {
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

  // --- SUBMETER DADOS DA ETAPA 2 ---
  if (formDiariaDados) {
    formDiariaDados.addEventListener('submit', (e) => {
      e.preventDefault();

      if (diasSelecionados.length === 0) {
        showToast('Selecione pelo menos uma data para continuar.', 'error');
        return;
      }

      // Coletar campos dinâmicos
      dadosExtrasSalvos = {};
      document.querySelectorAll('.dyn-input').forEach(input => {
        const name = input.name.replace('dyn_', '');
        dadosExtrasSalvos[name] = input.value;
      });

      // Atualizar tela da Etapa 3 (Resumo de Checkout)
      renderResumoCheckout();

      step2.style.display = 'none';
      step3.style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // --- NAVEGAÇÃO DO WIZARD ---
  window.deslogarWizard = function() {
    API.removeToken();
    atualizarEstadoUsuario();
  };

  window.voltarParaIdentificacao = function() {
    window.deslogarWizard();
  };

  window.voltarParaEmail = function() {
    formEmailCheck.style.display = 'block';
    formAuthLogin.style.display = 'none';
    formAuthRegister.style.display = 'none';
  };

  window.voltarParaDados = function() {
    step3.style.display = 'none';
    step2.style.display = 'block';
  };

  async function atualizarEstadoUsuario() {
    const user = API.getUser();
    const token = API.getToken();

    // Atualizar menu caso o participante já esteja logado
    const navUser = document.getElementById('nav-user-area');
    if (navUser) {
      if (user && token) {
        const firstName = user.nome ? user.nome.split(' ')[0] : 'Minha Área';
        const userIconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 6px;"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
        navUser.innerHTML = `${userIconSvg}<span>Olá, ${firstName}</span>`;
        navUser.href = '/usuario/dashboard.html';
      } else {
        navUser.innerHTML = 'Área do Participante';
        navUser.href = '/usuario/login.html';
      }
    }

    if (user && token) {
      if (loggedUserBanner) {
        loggedUserBanner.style.display = 'flex';
        const userIconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 6px;"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
        loggedUserMsg.innerHTML = `${userIconSvg}Participante ativo: <strong>${user.nome}</strong> (${user.email})`;
      }
      step1.style.display = 'none';
      step2.style.display = 'block';
      step3.style.display = 'none';
      step4.style.display = 'none';
      
      renderDynamicFormFields();

      // Checar se possui triagem de diária pendente
      try {
        const triagem = await API.request(`/diarias/triagem/pendente?evento_id=${eventoId}`);
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

      if (formEmailCheck) formEmailCheck.style.display = 'block';
      if (formAuthLogin) formAuthLogin.style.display = 'none';
      if (formAuthRegister) formAuthRegister.style.display = 'none';
    }
  }

  function exibirAvisoTriagem(triagem) {
    let banner = document.getElementById('triagem-diaria-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'triagem-diaria-banner';
      banner.style.cssText = 'background: #FAF5FF; border: 1.5px solid #C084FC; border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1.5rem; text-align: left;';
      const step2Card = document.getElementById('step-2');
      if (step2Card) {
        step2Card.insertBefore(banner, step2Card.firstChild);
      }
    }

    const diasTexto = Array.isArray(triagem.dias_selecionados) ? triagem.dias_selecionados.map(formatarDataIso).join(', ') : triagem.dias_selecionados;
    const totalFmt = parseFloat(triagem.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    banner.innerHTML = `
      <div style="color: #6B21A8; font-weight: 700; font-size: 1.05rem; margin-bottom: 0.25rem;">
        ⏳ Solicitação de diária pendente de pagamento
      </div>
      <p style="color: #581C87; font-size: 0.88rem; margin-bottom: 0.5rem; line-height: 1.4;">
        Você já iniciou a compra de diária para: <strong>${diasTexto}</strong> no valor de <strong>${totalFmt}</strong>.
      </p>
      <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
        <button type="button" class="btn btn-primary" style="background: #7E22CE; border-color: #7E22CE; font-size: 0.85rem; padding: 0.45rem 0.85rem;" onclick="retomarTriagemDiaria('${triagem.checkout_url}')">
          Ir para o Pagamento (InfinitePay) &rarr;
        </button>
        <button type="button" class="btn btn-outline" style="font-size: 0.85rem; padding: 0.45rem 0.85rem;" onclick="ignorarTriagemDiaria()">
          Alterar Dias / Recomeçar
        </button>
      </div>
    `;

    window.retomarTriagemDiaria = function(checkoutUrl) {
      if (checkoutUrl) {
        window.open(checkoutUrl, '_blank');
      }
      step2.style.display = 'none';
      step3.style.display = 'none';
      step4.style.display = 'block';
      renderResultadoPagamento(checkoutUrl, triagem.valor_total, triagem.dias_selecionados);
    };

    window.ignorarTriagemDiaria = function() {
      if (banner) banner.style.display = 'none';
    };
  }
});

// Renderizar Opções de Dias
function renderChecklistDias() {
  const container = document.getElementById('dias-checklist-container');
  if (!container || !diasConfig) return;

  const diasDisponiveis = diasConfig.filter(d => d.disponivel !== false);

  if (diasDisponiveis.length === 0) {
    container.innerHTML = `<div style="padding: 1rem; color: #EF4444; border: 1px dashed #EF4444; border-radius: var(--radius-md);">Nenhum dia disponível no momento.</div>`;
    return;
  }

  container.innerHTML = diasDisponiveis.map(dia => {
    const dataFmt = formatarDataIso(dia.data);
    const valorFmt = parseFloat(dia.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    return `
      <label class="dia-card-option" id="card-dia-${dia.data}">
        <div style="display: flex; align-items: center;">
          <input type="checkbox" class="cb-dia" value="${dia.data}" data-valor="${dia.valor}" onchange="toggleDia('${dia.data}', this)">
          <div class="dia-info">
            <span class="dia-nome">${dataFmt}</span>
            ${dia.descricao ? `<span class="dia-desc">${dia.descricao}</span>` : ''}
          </div>
        </div>
        <div class="dia-price">${valorFmt}</div>
      </label>
    `;
  }).join('');

  recalcularTotalDias();
}

window.toggleDia = function(dataStr, checkbox) {
  const card = document.getElementById(`card-dia-${dataStr}`);
  if (card) {
    if (checkbox.checked) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  }
  recalcularTotalDias();
};

function recalcularTotalDias() {
  diasSelecionados = [];
  valorTotalCalculado = 0;

  document.querySelectorAll('.cb-dia:checked').forEach(cb => {
    diasSelecionados.push(cb.value);
    valorTotalCalculado += parseFloat(cb.dataset.valor || 0);
  });

  const countElem = document.getElementById('resumo-dias-count');
  const valorElem = document.getElementById('resumo-total-valor');

  if (countElem) {
    countElem.textContent = diasSelecionados.length === 0 ? 
      'Nenhum dia selecionado' : 
      `${diasSelecionados.length} ${diasSelecionados.length === 1 ? 'dia selecionado' : 'dias selecionados'}`;
  }

  if (valorElem) {
    valorElem.textContent = valorTotalCalculado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
}

function renderResumoCheckout() {
  const resumoDias = document.getElementById('checkout-resumo-dias');
  const resumoTotal = document.getElementById('checkout-resumo-total');

  if (resumoDias) {
    resumoDias.innerHTML = diasSelecionados.map(dataStr => {
      const diaObj = diasConfig.find(d => d.data === dataStr);
      const valor = diaObj ? parseFloat(diaObj.valor) : 0;
      const dataFmt = formatarDataIso(dataStr);
      return `
        <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #E2E8F0;">
          <span>🗓️ <strong>${dataFmt}</strong> ${diaObj && diaObj.descricao ? `(${diaObj.descricao})` : ''}</span>
          <span style="font-weight: 700; color: #7E22CE;">${valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
        </div>
      `;
    }).join('');
  }

  if (resumoTotal) {
    resumoTotal.textContent = valorTotalCalculado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
}

window.finalizarDiariaECheckout = async function() {
  const btn = document.getElementById('btn-finalizar-diaria');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-sm"></span> Gerando Checkout...';
  }

  try {
    const res = await API.request('/diarias/triagem', {
      method: 'POST',
      body: JSON.stringify({
        evento_id: eventoAtual.evento_id,
        dias_selecionados: diasSelecionados,
        dados_extras: dadosExtrasSalvos
      })
    });

    const step3 = document.getElementById('step-3');
    const step4 = document.getElementById('step-4');
    if (step3) step3.style.display = 'none';
    if (step4) step4.style.display = 'block';

    renderResultadoPagamento(res.checkout_url, res.valor_total, res.dias_selecionados);

    // Se houver checkout_url, abre automaticamente em nova aba
    if (res.checkout_url) {
      window.open(res.checkout_url, '_blank');
    }

    showToast('Solicitação de diária registrada com sucesso!', 'success');

  } catch (err) {
    showToast(err.message || 'Erro ao gerar checkout da diária.', 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Ir para o Pagamento (InfinitePay) &rarr;';
    }
  }
};

function renderResultadoPagamento(checkoutUrl, valorTotal, dias) {
  const container = document.getElementById('payment-result');
  if (!container) return;

  const userAreaUrl = '/usuario/dashboard.html';
  const diasFmt = Array.isArray(dias) ? dias.map(formatarDataIso).join('<br>🗓️ ') : dias;
  const valorFmt = parseFloat(valorTotal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  container.innerHTML = `
    <div style="text-align: center; padding: 1.5rem 0.5rem;">
      <div class="badge badge-warning" style="font-size: 0.95rem; padding: 0.5rem 1rem; margin-bottom: 1.25rem;">
        Aguardando Pagamento da Diária
      </div>

      <h3 style="font-size: 1.4rem; font-weight: 800; color: #1E293B; margin-bottom: 0.5rem;">
        Conclua seu pagamento na InfinitePay
      </h3>

      <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 1.5rem;">
        Sua diária foi reservada e aguarda a confirmação de pagamento para liberar o credenciamento.
      </p>

      <div style="background: #FAF5FF; border: 1.5px solid #C084FC; border-radius: var(--radius-md); padding: 1.25rem; max-width: 480px; margin: 0 auto 1.75rem; text-align: left;">
        <div style="font-size: 0.85rem; font-weight: 700; color: #6B21A8; text-transform: uppercase; margin-bottom: 0.5rem;">
          Dias Contratados:
        </div>
        <div style="font-size: 0.95rem; color: #374151; margin-bottom: 1rem; line-height: 1.6;">
          🗓️ ${diasFmt}
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #C084FC; padding-top: 0.75rem;">
          <span style="font-weight: 700; color: #581C87;">Total:</span>
          <span style="font-size: 1.5rem; font-weight: 800; color: #7E22CE; font-family: 'Plus Jakarta Sans', sans-serif;">${valorFmt}</span>
        </div>
      </div>

      ${checkoutUrl ? `
        <a href="${checkoutUrl}" target="_blank" class="btn btn-primary" style="font-size: 1.15rem; padding: 0.9rem 2rem; background: #7E22CE; border-color: #7E22CE; display: inline-flex; align-items: center; gap: 0.5rem; text-decoration: none; margin-bottom: 1rem; box-shadow: 0 4px 12px rgba(126, 34, 206, 0.3);">
          <span>💳 Pagar na InfinitePay (Pix ou Cartão) &rarr;</span>
        </a>
      ` : ''}

      <div style="background: #EFF6FF; border: 1.5px solid #60A5FA; border-radius: var(--radius-md); padding: 1rem; max-width: 480px; margin: 1.25rem auto; text-align: left;">
        <strong style="color: #1E40AF; display: block; margin-bottom: 0.25rem; font-size: 0.9rem;">ℹ️ Confirmação Instantânea</strong>
        <span style="font-size: 0.85rem; color: #1E3A8A; line-height: 1.4; display: block;">
          Após pagar pelo Pix ou cartão no checkout da InfinitePay, seu status atualizará automaticamente e seu QR Code de check-in estará liberado na sua Área do Participante.
        </span>
      </div>

      <div style="margin-top: 1.5rem;">
        <a href="${userAreaUrl}" class="btn btn-outline" style="padding: 0.75rem 1.5rem;">
          Ir para a Minha Área
        </a>
      </div>
    </div>
  `;
}

// Renderização dos Campos Dinâmicos da Diária
function renderDynamicFormFields() {
  const listContainer = document.getElementById('dynamic-fields-list');
  const container = document.getElementById('dynamic-fields-container');
  const noFieldsMsg = document.getElementById('no-fields-msg');
  if (!listContainer || !container || !eventoAtual) return;

  const fieldsStr = eventoAtual.campos_formulario_diaria;
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
              <option value="">Selecione seu presbitério...</option>
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
      default:
        fieldHTML = `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">${field} *</label>
            <input type="text" name="dyn_${field}" class="form-control dyn-input" required>
          </div>
        `;
        break;
    }
    return fieldHTML;
  }).join('');

  const selectPresb = document.getElementById('dyn-select-presbiterio');
  if (selectPresb) {
    const valorPresb = (typeof dadosExtrasSalvos !== 'undefined' && dadosExtrasSalvos && dadosExtrasSalvos.presbiterio) ? dadosExtrasSalvos.presbiterio : '';
    carregarPresbiteriosSelect(selectPresb, valorPresb);
  }

  // Pré-preenchimento com dados do usuário logado
  const user = API.getUser();
  if (user) {
    const cpfInput = document.querySelector('input[name="dyn_cpf"]');
    if (cpfInput && !cpfInput.value) cpfInput.value = user.cpf || '';
    const foneInput = document.querySelector('input[name="dyn_telefone"]');
    if (foneInput && !foneInput.value) foneInput.value = user.telefone || '';
  }
}

// Máscaras de entrada
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

function carregarPresbiteriosSelect(selectEl, valorPreSelecionado = '') {
  if (!selectEl) return;

  const PRESBITERIOS_OFICIAIS = [
    "Presbitério Borborema",
    "Presbitério Central",
    "Presbitério do Brejo",
    "Presbitério João Pessoa",
    "Presbitério Leste",
    "Presbitério Metropolitano",
    "Presbitério Oeste",
    "Presbitério Paraíba",
    "Presbitério Sul Paraíba",
    "Outros"
  ];

  const getLista = () => {
    try {
      const cached = localStorage.getItem('cached_presbiterios');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return PRESBITERIOS_OFICIAIS.map(nome => ({ nome }));
  };

  const renderOpcoes = (lista) => {
    const valAtual = selectEl.value || valorPreSelecionado;
    selectEl.innerHTML = '<option value="">Selecione seu presbitério...</option>' + 
      lista.map(p => {
        const nome = typeof p === 'string' ? p : (p && p.nome ? p.nome : '');
        if (!nome) return '';
        const sel = (nome && nome === valAtual) ? 'selected' : '';
        return `<option value="${nome}" ${sel}>${nome}</option>`;
      }).join('');
    if (valAtual) selectEl.value = valAtual;
  };

  // 1. Renderiza imediatamente com dados locais/padrão (zero delay para o usuário)
  renderOpcoes(getLista());

  // 2. Sincroniza silenciosamente com o backend em segundo plano
  const baseUrl = (typeof API_BASE_URL !== 'undefined') ? API_BASE_URL : 'https://ump-inscricoes-e-eventos.onrender.com/api/v1';
  fetch(`${baseUrl}/presbiterios`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (Array.isArray(data) && data.length > 0) {
        localStorage.setItem('cached_presbiterios', JSON.stringify(data));
        renderOpcoes(data);
      }
    })
    .catch(() => {
      // Mantém silenciosamente a lista padrão/cache pronta
    });
}
