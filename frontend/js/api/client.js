'use strict';

window.ApiClient = (() => {
  const BASE_URL = window.AppConfig.API_URL;
  const TOKEN_KEY = 'crm_token';
  const USER_KEY = 'crm_user';
  const LOGIN_AT_KEY = 'crm_login_at';
  const TTL_MS = 8 * 60 * 60 * 1000;

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function getStoredUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch (error) {
      return null;
    }
  }

  function decodePayload(token) {
    try {
      const part = token.split('.')[1];
      const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        atob(base64).split('').map((c) => `%${('00' + c.charCodeAt(0).toString(16)).slice(-2)}`).join('')
      );
      return JSON.parse(json);
    } catch (error) {
      return null;
    }
  }

  function isExpired() {
    const token = getToken();
    if (!token) return true;
    const payload = decodePayload(token);
    if (payload && payload.exp) {
      return Date.now() >= payload.exp * 1000;
    }
    const loginAt = Number(localStorage.getItem(LOGIN_AT_KEY) || 0);
    if (loginAt) {
      return Date.now() - loginAt > TTL_MS;
    }
    return false;
  }

  function isAuthenticated() {
    return Boolean(getToken()) && !isExpired();
  }

  function setLogin(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user || null));
    localStorage.setItem(LOGIN_AT_KEY, String(Date.now()));
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(LOGIN_AT_KEY);
  }

  function handleUnauthorized() {
    clearToken();
    try {
      if (!window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
        window.location.replace('index.html');
      }
    } catch (error) {
      window.location.href = 'index.html';
    }
  }

  function unwrap(data) {
    if (data && typeof data === 'object') {
      if (data.meta && data.data !== undefined) {
        return { success: data.success, data: data.data, meta: data.meta };
      }
      return data.data !== undefined ? data.data : data;
    }
    return data;
  }

  async function request(path, options = {}) {
    const config = {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    };

    const token = getToken();
    if (token && !isExpired()) config.headers.Authorization = `Bearer ${token}`;

    if (options.body && typeof options.body !== 'string') {
      config.body = JSON.stringify(options.body);
    } else if (options.body) {
      config.body = options.body;
    }

    const url = `${BASE_URL}${path}`;

    let response;
    try {
      response = await fetch(url, config);
    } catch (error) {
      throw new Error('No se pudo conectar con el servidor. Verifica que el backend esté en ejecución.');
    }

    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (response.status === 401 && getToken()) {
      handleUnauthorized();
      throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
    }

    if (!response.ok) {
      const message = (data && data.message) || `Error ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return unwrap(data);
  }

  function buildQuery(params) {
    const query = Object.entries(params || {})
      .filter(([, value]) => value !== '' && value !== null && value !== undefined)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    return query ? `?${query}` : '';
  }

  return {
    get: (path, params) => request(`${path}${buildQuery(params)}`),
    post: (path, body) => request(path, { method: 'POST', body }),
    put: (path, body) => request(path, { method: 'PUT', body }),
    patch: (path, body) => request(path, { method: 'PATCH', body }),
    remove: (path) => request(path, { method: 'DELETE' }),
    postMultipart: (path, form) => {
      const config = { method: 'POST', body: form };
      const token = getToken();
      if (token && !isExpired()) {
        config.headers = { Authorization: `Bearer ${token}` };
      }
      return (async () => {
        const response = await fetch(`${BASE_URL}${path}`, config);
        const data = await response.json();
        if (response.status === 401 && getToken()) {
          handleUnauthorized();
          throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
        }
        if (!response.ok) {
          throw new Error((data && data.message) || `Error ${response.status}`);
        }
        return unwrap(data);
      })();
    },
    postBlob: (path, body) => {
      const config = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      };
      const token = getToken();
      if (token && !isExpired()) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return (async () => {
        const response = await fetch(`${BASE_URL}${path}`, config);
        if (response.status === 401 && getToken()) {
          handleUnauthorized();
          throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
        }
        if (!response.ok) {
          let data = null;
          try { data = await response.json(); } catch (e) { /* ignore */ }
          throw new Error((data && data.message) || `Error ${response.status}`);
        }
        return response.blob();
      })();
    },
    setToken: (token) => localStorage.setItem(TOKEN_KEY, token),
    clearToken,
    getToken,
    getStoredUser,
    setLogin,
    isAuthenticated,
    isExpired,
  };
})();
