document.addEventListener('DOMContentLoaded', () => {
  // Se o usuário já estiver autenticado, redirecionar direto para o painel
  if (API.getToken() && API.getUser()) {
    window.location.replace('dashboard.html');
    return;
  }

  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const senha = document.getElementById('login-senha').value;

      const submitBtn = document.getElementById('login-submit-btn');
      const errorDiv = document.getElementById('login-error');

      // Reset state
      if (errorDiv) {
        errorDiv.style.display = 'none';
        errorDiv.textContent = '';
      }

      let originalText = 'Acessar Painel';
      if (submitBtn) {
        originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = `<span class="spinner" style="display:inline-block; width: 16px; height: 16px; border: 2px solid white; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 0.5rem;"></span> Entrando...`;
        submitBtn.disabled = true;
      }

      try {
        const res = await API.request('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, senha })
        });

        API.setToken(res.access_token);
        API.setUser(res.user);

        showToast('Login efetuado com sucesso!', 'success');
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 1000);
      } catch (err) {
        if (errorDiv) {
          errorDiv.textContent = err.message || 'E-mail ou senha incorretos. Por favor, tente novamente.';
          errorDiv.style.display = 'block';
        }
        if (submitBtn) {
          submitBtn.innerHTML = originalText;
          submitBtn.disabled = false;
        }
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = document.getElementById('reg-nome').value;
      const email = document.getElementById('reg-email').value;
      const cpf = document.getElementById('reg-cpf').value;
      const telefone = document.getElementById('reg-telefone').value;
      const senha = document.getElementById('reg-senha').value;

      try {
        await API.request('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ nome, email, cpf, telefone, senha })
        });

        showToast('Conta criada com sucesso! Faça login.', 'success');
        document.getElementById('tab-login-btn').click();
      } catch (err) {
        // Trato pelo API.request
      }
    });
  }
});

function toggleAuthTab(tab) {
  const loginBox = document.getElementById('box-login');
  const regBox = document.getElementById('box-register');
  const btnLogin = document.getElementById('tab-login-btn');
  const btnReg = document.getElementById('tab-reg-btn');
  const titleEl = document.getElementById('auth-main-title');
  const subtitleEl = document.getElementById('auth-main-subtitle');

  if (tab === 'login') {
    if (loginBox) loginBox.style.display = 'block';
    if (regBox) regBox.style.display = 'none';
    if (btnLogin) {
      btnLogin.className = 'auth-tab-btn active';
      btnLogin.setAttribute('aria-selected', 'true');
    }
    if (btnReg) {
      btnReg.className = 'auth-tab-btn';
      btnReg.setAttribute('aria-selected', 'false');
    }
    if (titleEl) titleEl.textContent = 'Bem-vindo(a)!';
    if (subtitleEl) subtitleEl.textContent = 'Faça login para continuar';
  } else {
    if (loginBox) loginBox.style.display = 'none';
    if (regBox) regBox.style.display = 'block';
    if (btnLogin) {
      btnLogin.className = 'auth-tab-btn';
      btnLogin.setAttribute('aria-selected', 'false');
    }
    if (btnReg) {
      btnReg.className = 'auth-tab-btn active';
      btnReg.setAttribute('aria-selected', 'true');
    }
    if (titleEl) titleEl.textContent = 'Criar Conta';
    if (subtitleEl) subtitleEl.textContent = 'Preencha seus dados para começar';
  }
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  btn.innerHTML = isPassword
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
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
  if (e.target.id === 'reg-cpf') {
    e.target.value = formatarCPF(e.target.value);
  }
  if (e.target.id === 'reg-telefone') {
    e.target.value = formatarTelefone(e.target.value);
  }
});
