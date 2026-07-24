document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const senha = document.getElementById('login-senha').value;

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
        // Trato pelo API.request
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
