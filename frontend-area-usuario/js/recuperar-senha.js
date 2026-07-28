document.addEventListener('DOMContentLoaded', () => {
  const emailInput = document.getElementById('recover-email');
  const spinner = document.getElementById('email-check-spinner');
  const statusMsg = document.getElementById('email-status-msg');
  const recoverBtn = document.getElementById('recover-submit-btn');
  const recoverForm = document.getElementById('recover-form');
  const errorDiv = document.getElementById('recover-error');
  const successDiv = document.getElementById('recover-success');

  let emailVerified = false;
  let debounceTimeout = null;

  const showStatus = (text, type) => {
    statusMsg.style.display = 'block';
    statusMsg.textContent = text;
    if (type === 'success') {
      statusMsg.style.background = '#e0f2fe';
      statusMsg.style.color = '#0369a1';
      statusMsg.style.border = '1px solid #bae6fd';
    } else {
      statusMsg.style.background = '#fee2e2';
      statusMsg.style.color = '#b91c1c';
      statusMsg.style.border = '1px solid #fca5a5';
    }
  };

  const clearMessages = () => {
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';
  };

  // Escutar digitação do e-mail com debounce para verificação automática
  emailInput.addEventListener('input', () => {
    emailVerified = false;
    recoverBtn.disabled = true;
    statusMsg.style.display = 'none';
    clearMessages();

    const email = emailInput.value.trim();
    
    // Regra simples para evitar chamadas de API antes de um e-mail estruturado
    if (!email || !email.includes('@') || email.length < 5) {
      return;
    }

    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(async () => {
      if (spinner) spinner.style.display = 'block';

      try {
        const res = await API.request(`/auth/check-email?email=${encodeURIComponent(email)}`);
        if (res.exists) {
          emailVerified = true;
          showStatus('✅ E-mail encontrado! Botão de recuperação liberado.', 'success');
          recoverBtn.disabled = false;
        } else {
          emailVerified = false;
          showStatus('❌ Este e-mail não está cadastrado em nosso sistema.', 'error');
          recoverBtn.disabled = true;
        }
      } catch (err) {
        showStatus('Erro ao verificar e-mail. Tente novamente.', 'error');
        recoverBtn.disabled = true;
      } finally {
        if (spinner) spinner.style.display = 'none';
      }
    }, 600);
  });

  // Enviar formulário
  recoverForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!emailVerified) return;

    const email = emailInput.value.trim();
    clearMessages();

    recoverBtn.disabled = true;
    recoverBtn.innerHTML = '<span class="spinner"></span> Enviando...';

    try {
      await API.request('/auth/recuperar-senha', {
        method: 'POST',
        body: JSON.stringify({ email })
      });

      successDiv.style.display = 'block';
      successDiv.textContent = 'Uma nova senha temporária foi gerada e enviada para o seu e-mail com sucesso!';
      emailInput.value = '';
      emailVerified = false;
      recoverBtn.disabled = true;
      statusMsg.style.display = 'none';
    } catch (err) {
      errorDiv.style.display = 'block';
      errorDiv.textContent = err.message || 'Erro ao processar recuperação de senha. Tente novamente.';
      recoverBtn.disabled = false;
      recoverBtn.textContent = 'Recuperar Senha';
    }
  });
});
