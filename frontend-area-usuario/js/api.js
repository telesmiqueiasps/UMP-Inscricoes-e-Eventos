const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8000/api/v1'
  : 'https://ump-inscricoes-e-eventos.onrender.com/api/v1';

const API = {
  getToken() {
    return localStorage.getItem('token');
  },
  setToken(token) {
    localStorage.setItem('token', token);
  },
  removeToken() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },
  getUser() {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u) : null;
  },
  setUser(user) {
    localStorage.setItem('user', JSON.stringify(user));
  },
  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = { ...options, headers };

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401) {
          this.removeToken();
          window.location.href = 'login.html';
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
    container.style.cssText = 'position: fixed; bottom: 2rem; right: 2rem; z-index: 9999; display: flex; flex-direction: column; gap: 0.5rem;';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.style.cssText = `padding: 1rem 1.5rem; border-radius: 8px; color: white; font-weight: 500; background: ${type === 'success' ? '#059669' : '#DC2626'}; box-shadow: 0 4px 12px rgba(0,0,0,0.15);`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 4000);
}
