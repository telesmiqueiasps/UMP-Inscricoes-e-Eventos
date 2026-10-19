const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8000/api/v1'
  : 'https://ump-inscricoes-e-eventos.onrender.com/api/v1';

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

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers
    };

    try {
      let response;
      try {
        response = await fetch(`${API_BASE_URL}${endpoint}`, config);
      } catch (networkErr) {
        if (API_BASE_URL.includes('localhost') || API_BASE_URL.includes('127.0.0.1')) {
          console.warn('API local inacessível. Tentando servidor na nuvem...');
          response = await fetch(`https://ump-inscricoes-e-eventos.onrender.com/api/v1${endpoint}`, config);
        } else {
          throw networkErr;
        }
      }
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401) {
          this.removeToken();
          if (typeof window.deslogarWizard === 'function') {
            window.deslogarWizard();
          }
        }
        throw new Error(data.detail || 'Ocorreu um erro na requisição.');
      }

      return data;
    } catch (error) {
      showToast(error.message, 'error');
      throw error;
    }
  }
};

function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}
