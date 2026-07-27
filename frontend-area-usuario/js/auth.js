document.addEventListener('DOMContentLoaded', () => {
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

  if (tab === 'login') {
    loginBox.style.display = 'block';
    regBox.style.display = 'none';
    btnLogin.className = 'btn btn-primary';
    btnReg.className = 'btn btn-outline';
  } else {
    loginBox.style.display = 'none';
    regBox.style.display = 'block';
    btnLogin.className = 'btn btn-outline';
    btnReg.className = 'btn btn-primary';
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
  if (e.target.id === 'reg-cpf') {
    e.target.value = formatarCPF(e.target.value);
  }
  if (e.target.id === 'reg-telefone') {
    e.target.value = formatarTelefone(e.target.value);
  }
});
