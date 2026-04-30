require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const API_BASE_URL = (process.env.API_BASE_URL || 'https://insighta-api-production-74ec.up.railway.app').replace(/\/$/, '');
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.cookies.csrf_token) {
    res.cookie('csrf_token', generateCsrfToken(), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 60 * 1000,
    });
  }
  next();
});

// ======================
// Helpers
// ======================
function generateCsrfToken() {
  return crypto.randomBytes(64).toString('hex');
}

function getPublicBaseUrl(req) {
  return (PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
  };
}

// Auth Middleware
function requirePageAuth(req, res, next) {
  if (!req.cookies.access_token && !req.cookies.refresh_token) {
    return res.redirect('/login.html');
  }
  next();
}

function requireApiAuth(req, res, next) {
  if (!req.cookies.access_token) {
    return res.status(401).json({ status: 'error', message: 'Authentication required' });
  }
  next();
}

// CSRF Middleware
function csrfProtect(req, res, next) {
  if (req.method === 'GET') {
    const token = generateCsrfToken();
    res.cookie('csrf_token', token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 60 * 1000,
    });
    req.csrfToken = token;
    return next();
  }

  const cookieToken = req.cookies.csrf_token;
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  next();
}

// ======================
// Auth Routes
// ======================
app.get('/auth/github', (req, res) => {
  const githubAuthURL = new URL('/auth/github', API_BASE_URL);
  githubAuthURL.searchParams.set('client', 'web');
  githubAuthURL.searchParams.set('web_redirect_uri', `${getPublicBaseUrl(req)}/auth/callback`);
  res.redirect(githubAuthURL.toString());
});

app.get('/auth/callback', (req, res) => {
  const { access_token, refresh_token } = req.query;

  if (!access_token || !refresh_token) {
    return res.redirect('/login.html?error=auth_failed');
  }

  res.cookie('access_token', access_token, cookieOptions(15 * 60 * 1000));
  res.cookie('refresh_token', refresh_token, cookieOptions(7 * 24 * 60 * 60 * 1000));
  res.redirect('/dashboard');
});

app.post('/auth/refresh', csrfProtect, async (req, res) => {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/auth/refresh`,
      { refresh_token: req.cookies.refresh_token },
      {
        headers: { 'X-API-Version': '1' },
        validateStatus: () => true,
      }
    );

    if (response.status >= 400) {
      res.clearCookie('access_token');
      res.clearCookie('refresh_token');
      return res.status(response.status).json(response.data);
    }

    res.cookie('access_token', response.data.access_token, cookieOptions(15 * 60 * 1000));
    res.cookie('refresh_token', response.data.refresh_token, cookieOptions(7 * 24 * 60 * 60 * 1000));
    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});


app.get('/api/me', requireApiAuth, async (req, res) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/auth/me`, {
      headers: {
        Authorization: `Bearer ${req.cookies.access_token}`,
        'X-API-Version': '1',
      },
    });
    res.json(response.data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ status: 'error', message: 'Server error' });
  }
});

// ======================
// Pages
// ======================
app.get('/', (req, res) => res.redirect('/login.html'));

app.get('/dashboard', requirePageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

app.get('/profiles', requirePageAuth, (req, res) => res.sendFile(path.join(__dirname, 'public/profiles.html')));
app.get('/profile/:id', requirePageAuth, (req, res) => res.sendFile(path.join(__dirname, 'public/profile.html')));
app.get('/search', requirePageAuth, (req, res) => res.sendFile(path.join(__dirname, 'public/search.html')));
app.get('/account', requirePageAuth, (req, res) => res.sendFile(path.join(__dirname, 'public/account.html')));

// ======================
// API Proxy Routes
// ======================
app.all(/^\/api\/.*/, requireApiAuth, async (req, res) => {
  try {
    const response = await axios.request({
      method: req.method,
      url: `${API_BASE_URL}${req.originalUrl}`,
      headers: {
        Authorization: `Bearer ${req.cookies.access_token}`,
        'Content-Type': req.get('content-type') || 'application/json',
        'X-API-Version': '1',
      },
      data: req.body,
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });

    const contentType = response.headers['content-type'];
    const contentDisposition = response.headers['content-disposition'];

    if (contentType) res.set('Content-Type', contentType);
    if (contentDisposition) res.set('Content-Disposition', contentDisposition);

    res.status(response.status).send(response.data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ status: 'error', message: 'Server error' });
  }
});

// ======================
// Logout
// ======================
app.post('/logout', csrfProtect, async (req, res) => {
  try {
    if (req.cookies.refresh_token) {
      await axios.post(
        `${API_BASE_URL}/auth/logout`,
        { refresh_token: req.cookies.refresh_token },
        {
          headers: {
            Authorization: `Bearer ${req.cookies.access_token || ''}`,
            'X-API-Version': '1',
          },
          validateStatus: () => true,
        }
      );
    }
  } catch {}

  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
  res.redirect('/login.html');
});

// ======================
// Server
// ======================
const server = app.listen(PORT, HOST, () => {
  console.log(`Insighta Web Portal is running!`);
  console.log(`→ http://${HOST}:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
    process.exit(1);
  }
  if (err.code === 'EPERM') {
    console.error(`Unable to listen on ${HOST}:${PORT}.`);
    process.exit(1);
  }
  throw err;
});