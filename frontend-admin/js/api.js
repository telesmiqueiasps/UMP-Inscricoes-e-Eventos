let API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8000/api/v1'
  : 'https://ump-inscricoes-e-eventos.onrender.com/api/v1';

const REMOTE_API_FALLBACK = 'https://ump-inscricoes-e-eventos.onrender.com/api/v1';

const API = {
  getToken() {
    const t = localStorage.getItem('token') || localStorage.getItem('admin_token');
    if (!t || t === 'null' || t === 'undefined') return null;
    return t;
  },
  setToken(token) {
    if (!token) return;
    localStorage.setItem('token', token);
    localStorage.setItem('admin_token', token);
  },
  removeToken() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
  },
  getUser() {
    const raw = localStorage.getItem('user') || localStorage.getItem('admin_user');
    if (!raw || raw === 'null' || raw === 'undefined') return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },
  setUser(user) {
    if (!user) return;
    const str = typeof user === 'string' ? user : JSON.stringify(user);
    localStorage.setItem('user', str);
    localStorage.setItem('admin_user', str);
  },
  async request(endpoint, options = {}) {
    const headers = {
      ...options.headers
    };
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const isLoginEndpoint = endpoint.includes('/auth/login') || endpoint.includes('/auth/token');
    const token = this.getToken();
    if (token && !isLoginEndpoint) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = { ...options, headers };

    try {
      let response;
      try {
        response = await fetch(`${API_BASE_URL}${endpoint}`, config);
      } catch (fetchErr) {
        // Se em localhost e falhar por indisponibilidade local, tentar fallback na nuvem (Render)
        if (API_BASE_URL.includes('localhost') || API_BASE_URL.includes('127.0.0.1')) {
          console.warn(`[API] Servidor local (${API_BASE_URL}) indisponível. Tentando fallback no servidor de produção...`);
          response = await fetch(`${REMOTE_API_FALLBACK}${endpoint}`, config);
          API_BASE_URL = REMOTE_API_FALLBACK;
        } else {
          throw fetchErr;
        }
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (!isLoginEndpoint && (response.status === 401 || response.status === 403)) {
          showToast('Sessão expirada ou sem acesso administrativo.', 'error');
        }

        let errorMsg = 'Ocorreu um erro na requisição.';
        if (typeof data.detail === 'string') {
          errorMsg = data.detail;
        } else if (Array.isArray(data.detail)) {
          errorMsg = data.detail.map(d => (d && d.msg) ? d.msg : JSON.stringify(d)).join('; ');
        } else if (data.detail && typeof data.detail === 'object') {
          errorMsg = data.detail.msg || JSON.stringify(data.detail);
        } else if (data.mensagem) {
          errorMsg = data.mensagem;
        }

        const err = new Error(errorMsg);
        err.status = response.status;
        throw err;
      }

      return data;
    } catch (error) {
      if (!isLoginEndpoint) {
        showToast(error.message, 'error');
      }
      throw error;
    }
  }
};

function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position: fixed; bottom: 2rem; right: 2rem; z-index: 100005; display: flex; flex-direction: column; gap: 0.5rem; pointer-events: none;';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.style.cssText = `padding: 1rem 1.5rem; border-radius: 8px; color: white; font-weight: 500; background: ${type === 'success' ? '#059669' : '#DC2626'}; box-shadow: 0 4px 12px rgba(0,0,0,0.15); pointer-events: auto;`;
  toast.textContent = typeof message === 'string' ? message : JSON.stringify(message);
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 4000);
}
