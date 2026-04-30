// Insighta Web Portal Utils

// ---- Token refresh ----
let _refreshPromise = null;

async function refreshToken() {
  // Deduplicate concurrent refresh calls
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    try {
      const res = await fetch('/auth/refresh', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': getCookie('csrf_token') || '',
          'Content-Type': 'application/json',
          'X-API-Version': '1',
        },
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

// ---- API helper with auto-refresh ----
async function apiFetch(url, options = {}, _retry = true) {
  try {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Version': '1',
        ...(options.headers || {})
      },
      ...options
    });

    // If 401, try to refresh once then retry
    if (res.status === 401 && _retry) {
      const refreshed = await refreshToken();
      if (refreshed) {
        return apiFetch(url, options, false);
      } else {
        window.location.href = '/login.html';
        return null;
      }
    }

    if (res.status === 403) {
      window.location.href = '/login.html';
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error('API Error:', err);
    return null;
  }
}

async function api(url, options = {}) {
  return await apiFetch(url, options);
}

// GET current user
async function getMe() {
  return await apiFetch('/api/me');
}

// Role check
async function enforceRole() {
  const me = await getMe();
  if (!me?.data) return;

  const role = me.data.role;

  // hide admin-only UI
  if (role !== 'admin') {
    document.querySelectorAll('.admin-only')
      .forEach(el => el.style.display = 'none');
  }

  return me.data;
}

// Logout
async function logout() {
  await fetch('/logout', {
    method: 'POST',
    headers: {
      'X-CSRF-Token': getCookie('csrf_token') || '',
      'X-API-Version': '1',
    },
  });
  window.location.href = '/login.html';
}

// Loader helpers
function showLoading(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';
}

function hideLoading(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

// Table helpers
function clearTableBody(id) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = '';
}

function showError(message, id = 'error-msg') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
}

// Pagination helper
function updatePagination({ page, totalPages, total, prefix = '' }) {
  document.getElementById(`${prefix}page-info`).textContent =
    `Page ${page} of ${totalPages} (${total})`;

  document.getElementById(`${prefix}prev-btn`).disabled = page <= 1;
  document.getElementById(`${prefix}next-btn`).disabled = page >= totalPages;
}

// Cookies
function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

// Expose globally
window.utils = {
  apiFetch,
  api,
  getMe,
  enforceRole,
  logout,
  showLoading,
  hideLoading,
  clearTableBody,
  showError,
  updatePagination,
  getCookie,
  refreshToken,
};

// Expose as globals for inline scripts
window.api = api;
window.getMe = getMe;
window.getCookie = getCookie;
window.logout = logout;
window.enforceRole = enforceRole;
window.refreshToken = refreshToken;
