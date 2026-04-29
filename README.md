# Insighta Labs+ Web Portal

Simple Express-powered web portal for Insighta Labs+. This repository is the **web portal** part of the Stage 3 system and connects to the deployed Insighta backend API.

## Overview

The portal provides non-technical users with a browser interface for:

- GitHub login
- Dashboard metrics
- Profile listing with filters, sorting, and pagination
- Profile detail view
- Natural language search
- Account/session view
- CSV export

The backend remains the single source of truth for authentication, users, roles, profiles, rate limiting, logging, and data storage.

## Architecture

Stage 3 is split into three applications:

- **Backend API**: owns GitHub OAuth, users, roles, tokens, profile APIs, rate limiting, logging, and database access.
- **CLI**: local command-line client that authenticates through the backend and stores tokens locally.
- **Web portal**: this repository. It serves HTML pages, stores backend-issued tokens in HTTP-only cookies, and proxies `/api/*` calls to the backend.

Current backend URL:

```text
https://insighta-api-production-74ec.up.railway.app
```

## Authentication Flow

The web portal does not exchange GitHub OAuth codes itself. The backend owns OAuth.

Flow:

```text
User clicks Continue with GitHub
-> Web portal GET /auth/github
-> Redirects to backend /auth/github?client=web&web_redirect_uri=<web>/auth/callback
-> Backend handles GitHub OAuth
-> Backend redirects back to web /auth/callback with access_token and refresh_token
-> Web portal stores tokens in HTTP-only cookies
-> User is redirected to /dashboard
```

The backend must redirect back to:

```text
<WEB_PUBLIC_URL>/auth/callback?access_token=...&refresh_token=...
```

## Token Handling

The web portal stores tokens in HTTP-only cookies:

- `access_token`: 3 minutes
- `refresh_token`: 5 minutes

Browser JavaScript cannot read these token cookies. API requests go through the Express server, which reads the cookies server-side and forwards the access token to the backend as:

```text
Authorization: Bearer <access_token>
```

When the backend returns `401`, frontend utility code calls:

```text
POST /auth/refresh
```

The portal forwards the refresh token to the backend, rotates both cookies on success, and retries the original request once.

## CSRF Protection

The web portal uses a readable `csrf_token` cookie and requires the same value in:

```text
X-CSRF-Token
```

for state-changing local web routes such as logout and refresh.

## API Proxy

All browser API calls use same-origin paths:

```text
/api/profiles
/api/profiles/search
/api/profiles/export?format=csv
/api/me
```

The Express server proxies `/api/*` to:

```text
${API_BASE_URL}/api/*
```

and adds:

```text
X-API-Version: 1
Authorization: Bearer <access_token>
```

CSV responses preserve backend `Content-Type` and `Content-Disposition` headers so downloads work.

## Local Development

Install dependencies:

```bash
npm install
```

Create `.env`:

```env
API_BASE_URL=https://insighta-api-production-74ec.up.railway.app
PORT=3001
```

Start the portal:

```bash
npm start
```

Open:

```text
http://localhost:3001/login.html
```

## Deployment

Recommended platform: **Railway**, because this is an Express app and the backend is already deployed on Railway.

Railway service variables for the web portal:

```env
NODE_ENV=production
API_BASE_URL=https://insighta-api-production-74ec.up.railway.app
PUBLIC_BASE_URL=https://your-web-portal-url.up.railway.app
```

Do not set `PORT` on Railway unless the platform requires it. Railway provides `PORT` automatically.

Start command:

```bash
npm start
```

Build command:

```bash
npm install
```

## Backend Deployment Requirements

The backend service must know the deployed web portal URL, for example:

```env
WEB_APP_URL=https://your-web-portal-url.up.railway.app
```

The backend must support the web login redirect parameter:

```text
web_redirect_uri
```

and redirect back to:

```text
https://your-web-portal-url.up.railway.app/auth/callback?access_token=...&refresh_token=...
```

The GitHub OAuth callback configured in GitHub should point to the backend callback route, not the web portal:

```text
https://insighta-api-production-74ec.up.railway.app/auth/github/callback
```

## Pages

| Page | Path |
| --- | --- |
| Login | `/login.html` |
| Dashboard | `/dashboard` |
| Profiles | `/profiles` |
| Profile Detail | `/profile/:id` |
| Search | `/search` |
| Account | `/account` |

## Scripts

```bash
npm start
npm run dev
```

Both commands run:

```bash
node server.js
```

## Pre-Deploy Checklist

- `node --check server.js` passes.
- `.env` does not contain GitHub secrets.
- `API_BASE_URL` points to the deployed backend.
- `PUBLIC_BASE_URL` is set in production.
- Backend accepts `web_redirect_uri`.
- Backend redirects to `/auth/callback` with `access_token` and `refresh_token`.
- GitHub OAuth callback points to backend `/auth/github/callback`.

