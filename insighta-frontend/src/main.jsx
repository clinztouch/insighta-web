import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

let refreshPromise = null

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

async function refreshToken() {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const res = await fetch('/auth/refresh', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': getCookie('csrf_token') || '',
          'Content-Type': 'application/json',
          'X-API-Version': '1',
        },
      })
      return res.ok
    } catch {
      return false
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

async function apiFetch(url, options = {}, retry = true) {
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Version': '1',
        ...(options.headers || {}),
      },
    })

    if (res.status === 401 && retry) {
      const refreshed = await refreshToken()
      if (refreshed) return apiFetch(url, options, false)
      window.location.href = '/login.html'
      return null
    }

    if (res.status === 403) {
      window.location.href = '/login.html'
      return null
    }

    return await res.json()
  } catch (err) {
    console.error('API Error:', err)
    return null
  }
}

function formatDate(ts) {
  if (!ts) return '-'
  return new Date(ts).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function routeFromLocation() {
  const path = window.location.pathname
  if (path === '/' || path === '/login' || path === '/login.html') return { name: 'login' }
  if (path === '/dashboard') return { name: 'dashboard' }
  if (path === '/profiles') return { name: 'profiles' }
  if (path.startsWith('/profile/')) return { name: 'profile', id: path.split('/').pop() }
  if (path === '/search') return { name: 'search' }
  if (path === '/account') return { name: 'account' }
  return { name: 'login' }
}

function App() {
  const [route, setRoute] = useState(routeFromLocation)

  useEffect(() => {
    const onPopState = () => setRoute(routeFromLocation())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  if (route.name === 'login') return <Login />

  return (
    <>
      <Nav active={route.name} />
      {route.name === 'dashboard' && <Dashboard />}
      {route.name === 'profiles' && <Profiles />}
      {route.name === 'profile' && <Profile id={route.id} />}
      {route.name === 'search' && <Search />}
      {route.name === 'account' && <Account />}
    </>
  )
}

function Nav({ active }) {
  const links = [
    ['dashboard', '/dashboard', 'Dashboard'],
    ['profiles', '/profiles', 'Profiles'],
    ['search', '/search', 'Search'],
    ['account', '/account', 'Account'],
  ]

  return (
    <nav>
      <a href="/dashboard" className="brand">Insighta Labs+</a>
      <ul>
        {links.map(([key, href, label]) => (
          <li key={key}>
            <a href={href} className={active === key ? 'active' : ''}>{label}</a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function Login() {
  return (
    <div className="login-page">
      <div className="login-box">
        <h1>Insighta Labs+</h1>
        <p>Demographic Intelligence Platform</p>
        <a href="/auth/github" className="btn-github">
          <svg width="20" height="20" fill="white" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
          </svg>
          Continue with GitHub
        </a>
      </div>
    </div>
  )
}

function Dashboard() {
  const [me, setMe] = useState(null)
  const [stats, setStats] = useState({ total: '-', male: '-', female: '-', countries: '30+' })
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true

    async function loadDashboard() {
      const user = await apiFetch('/api/me')
      if (!alive || !user?.data) return
      setMe(user.data)

      const [allData, maleData, femaleData, recentData] = await Promise.all([
        apiFetch('/api/profiles?limit=1'),
        apiFetch('/api/profiles?gender=male&limit=1'),
        apiFetch('/api/profiles?gender=female&limit=1'),
        apiFetch('/api/profiles?limit=5'),
      ])

      if (!alive) return
      setStats({
        total: allData?.total?.toLocaleString() || '-',
        male: maleData?.total?.toLocaleString() || '-',
        female: femaleData?.total?.toLocaleString() || '-',
        countries: '30+',
      })
      setRecent(recentData?.data || [])
      setLoading(false)
    }

    loadDashboard()
    return () => { alive = false }
  }, [])

  return (
    <main className="container">
      <div className="page-header">
        <h1>Dashboard</h1>
        <button type="button" className="btn btn-danger btn-sm" onClick={logout}>Logout</button>
      </div>

      <div className="stats-grid">
        <Stat number={stats.total} label="Total Profiles" />
        <Stat number={stats.male} label="Male Profiles" />
        <Stat number={stats.female} label="Female Profiles" />
        <Stat number={stats.countries} label="Countries" />
      </div>

      <div className="card">
        <h2>Welcome back, <span>{me?.username || '...'}</span></h2>
        <p className="muted">Role: <span className={`badge badge-${me?.role || ''}`}>{me?.role || '-'}</span></p>
      </div>

      <div className="card">
        <h3>Recent Profiles</h3>
        {loading ? <div className="loading">Loading...</div> : <ProfilesTable profiles={recent} compact />}
      </div>
    </main>
  )
}

function Stat({ number, label }) {
  return (
    <div className="stat-card">
      <div className="number">{number}</div>
      <div className="label">{label}</div>
    </div>
  )
}

function Profiles() {
  const [filters, setFilters] = useState({
    gender: '',
    age_group: '',
    country_id: '',
    min_age: '',
    max_age: '',
    sort_by: 'created_at',
    order: 'desc',
  })
  const [profiles, setProfiles] = useState([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [me, setMe] = useState(null)
  const [name, setName] = useState('')

  const params = useMemo(() => {
    const query = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value) query.set(key, key === 'country_id' ? value.toUpperCase() : value)
    })
    return query
  }, [filters])

  async function loadProfiles(nextPage = page) {
    setLoading(true)
    setError('')
    const query = new URLSearchParams(params)
    query.set('page', nextPage)
    query.set('limit', 10)

    const data = await apiFetch(`/api/profiles?${query.toString()}`)
    if (data?.data) {
      setProfiles(data.data)
      setPage(nextPage)
      setTotalPages(data.total_pages || 1)
      setTotal(data.total || 0)
    } else {
      setError('Failed to load profiles')
    }
    setLoading(false)
  }

  useEffect(() => {
    apiFetch('/api/me').then((data) => setMe(data?.data || null))
    loadProfiles(1)
  }, [])

  async function createProfile() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Name is required')
      return
    }

    await apiFetch('/api/profiles', {
      method: 'POST',
      body: JSON.stringify({ name: trimmed }),
    })
    setName('')
    loadProfiles(1)
  }

  function exportProfiles() {
    const query = new URLSearchParams(params)
    query.set('format', 'csv')
    window.location.href = `/api/profiles/export?${query.toString()}`
  }

  return (
    <main className="container">
      <div className="page-header">
        <h1>Profiles</h1>
        <button type="button" className="btn btn-dark btn-sm" onClick={exportProfiles}>Export CSV</button>
      </div>

      <div className="card">
        <div className="filters">
          <Select label="Gender" value={filters.gender} onChange={(gender) => setFilters({ ...filters, gender })} options={[['', 'All'], ['male', 'Male'], ['female', 'Female']]} />
          <Select label="Age Group" value={filters.age_group} onChange={(age_group) => setFilters({ ...filters, age_group })} options={[['', 'All'], ['child', 'Child'], ['teenager', 'Teenager'], ['adult', 'Adult'], ['senior', 'Senior']]} />
          <Field label="Country ID" value={filters.country_id} maxLength="2" onChange={(country_id) => setFilters({ ...filters, country_id })} />
          <Field label="Min Age" type="number" value={filters.min_age} onChange={(min_age) => setFilters({ ...filters, min_age })} />
          <Field label="Max Age" type="number" value={filters.max_age} onChange={(max_age) => setFilters({ ...filters, max_age })} />
          <Select label="Sort By" value={filters.sort_by} onChange={(sort_by) => setFilters({ ...filters, sort_by })} options={[['created_at', 'Created At'], ['age', 'Age'], ['gender_probability', 'Gender Prob.']]} />
          <Select label="Order" value={filters.order} onChange={(order) => setFilters({ ...filters, order })} options={[['desc', 'Desc'], ['asc', 'Asc']]} />
          <div className="filter-group">
            <label>&nbsp;</label>
            <button className="btn btn-primary btn-sm" type="button" onClick={() => loadProfiles(1)}>Apply</button>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading ? <div className="loading">Loading profiles...</div> : <ProfilesTable profiles={profiles} />}

      {!loading && (
        <div className="pagination">
          <button type="button" disabled={page <= 1} onClick={() => loadProfiles(page - 1)}>Prev</button>
          <span>Page {page} of {totalPages} ({total} total)</span>
          <button type="button" disabled={page >= totalPages} onClick={() => loadProfiles(page + 1)}>Next</button>
        </div>
      )}

      {me?.role === 'admin' && (
        <div className="card admin-only">
          <h3>Create Profile</h3>
          <input value={name} placeholder="Name" onChange={(event) => setName(event.target.value)} />
          <button className="btn btn-primary" type="button" onClick={createProfile}>Create</button>
        </div>
      )}
    </main>
  )
}

function Field({ label, value, onChange, type = 'text', maxLength }) {
  return (
    <div className="filter-group">
      <label>{label}</label>
      <input type={type} value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

function Select({ label, value, onChange, options }) {
  return (
    <div className="filter-group">
      <label>{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, text]) => <option key={optionValue} value={optionValue}>{text}</option>)}
      </select>
    </div>
  )
}

function ProfilesTable({ profiles, compact = false }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Gender</th>
          <th>Age</th>
          {!compact && <th>Age Group</th>}
          <th>Country</th>
          {!compact && <th>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {profiles.map((profile) => (
          <tr key={profile.id}>
            <td><a className="table-link" href={`/profile/${profile.id}`}>{profile.name}</a></td>
            <td><span className={`badge badge-${profile.gender}`}>{profile.gender}</span></td>
            <td>{compact ? `${profile.age} (${profile.age_group})` : profile.age}</td>
            {!compact && <td>{profile.age_group}</td>}
            <td>{profile.country_name}</td>
            {!compact && <td><a href={`/profile/${profile.id}`} className="btn btn-primary btn-sm">View</a></td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Profile({ id }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadProfile() {
      const data = await apiFetch(`/api/profiles/${id}`)
      if (data?.data) setProfile(data.data)
      else setError(data?.message || 'Profile not found.')
      setLoading(false)
    }
    loadProfile()
  }, [id])

  return (
    <main className="container">
      <div className="page-header">
        <h1>Profile Detail</h1>
        <a href="/profiles" className="btn btn-sm btn-muted">Back to Profiles</a>
      </div>

      {loading && <div className="loading">Loading profile...</div>}
      {error && <div className="alert alert-error">{error}</div>}
      {profile && (
        <div className="card">
          <div className="detail-grid">
            <Detail label="Name" value={profile.name} />
            <div className="detail-item"><label>Gender</label><span><span className={`badge badge-${profile.gender}`}>{profile.gender}</span></span></div>
            <Detail label="Age" value={profile.age} />
            <Detail label="Age Group" value={profile.age_group} />
            <Detail label="Country" value={`${profile.country_name} (${profile.country_id})`} />
            <Detail label="Gender Confidence" value={`${(profile.gender_probability * 100).toFixed(1)}%`} />
            <Detail label="Country Confidence" value={profile.country_probability ? `${(profile.country_probability * 100).toFixed(1)}%` : '-'} />
            <Detail label="Created" value={formatDate(profile.created_at)} />
          </div>
        </div>
      )}
    </main>
  )
}

function Detail({ label, value }) {
  return (
    <div className="detail-item">
      <label>{label}</label>
      <span>{value}</span>
    </div>
  )
}

function Search() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch('/api/me')
  }, [])

  async function searchProfiles() {
    const q = query.trim()
    if (!q) return

    setLoading(true)
    setSearched(true)
    setError('')
    setResults([])

    const data = await apiFetch(`/api/profiles/search?q=${encodeURIComponent(q)}`)
    if (data?.data) setResults(data.data)
    else setError('Search failed. Please try again.')
    setLoading(false)
  }

  return (
    <main className="container">
      <div className="page-header">
        <h1>Natural Language Search</h1>
      </div>

      <div className="card">
        <div className="search-box">
          <input value={query} type="text" placeholder="e.g. senior females from Nigeria age 30+" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && searchProfiles()} />
          <button className="btn btn-primary" type="button" onClick={searchProfiles}>Search</button>
        </div>
      </div>

      {loading && <div className="loading">Searching...</div>}
      {error && <div className="alert alert-error">{error}</div>}
      {!loading && searched && results.length === 0 && !error && <div className="empty-state">No results found.</div>}
      {results.length > 0 && <ProfilesTable profiles={results} />}
    </main>
  )
}

function Account() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    async function loadAccount() {
      const data = await apiFetch('/api/me')
      if (data?.data) setUser(data.data)
      else setError('Failed to load account info. Please try again.')
      setLoading(false)
    }
    loadAccount()
  }, [])

  async function handleLogout() {
    setLoggingOut(true)
    await logout()
  }

  return (
    <main className="container">
      <div className="page-header">
        <h1>Account</h1>
      </div>

      {loading && <div className="loading">Loading account info...</div>}
      {error && <div className="alert alert-error">{error}</div>}
      {user && (
        <>
          <div className="card">
            <div className="account-card">
              <div>
                {user.avatar_url ? <img src={user.avatar_url} className="avatar" alt="Avatar" /> : <div className="avatar-placeholder">{(user.username || '?')[0].toUpperCase()}</div>}
              </div>
              <div className="account-info">
                <h2>{user.username || '-'}</h2>
                <div className="email">{user.email || 'No email on record'}</div>
                <div>
                  <span className={`badge badge-${user.role}`}>{user.role || '-'}</span>
                  <span className="active-status"><span className="status-dot"></span><span>Active</span></span>
                </div>
                <div className="account-meta">
                  <div className="meta-item">GitHub: <strong>{user.username ? `@${user.username}` : '-'}</strong></div>
                  <div className="meta-item">Last login: <strong>{formatDate(user.last_login_at)}</strong></div>
                  <div className="meta-item">Member since: <strong>{formatDate(user.created_at)}</strong></div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <h3>Session Info</h3>
            <p className="muted">Your session uses short-lived tokens that refresh automatically. Access tokens expire every <strong>3 minutes</strong>, refresh tokens every <strong>5 minutes</strong>.</p>
            <div className="session-status">Session active</div>
          </div>

          <div className="danger-zone">
            <h3>Sign Out</h3>
            <p>This will invalidate your current session and remove all tokens.</p>
            <button className="btn btn-danger" type="button" disabled={loggingOut} onClick={handleLogout}>{loggingOut ? 'Logging out...' : 'Logout'}</button>
          </div>
        </>
      )}
    </main>
  )
}

async function logout() {
  try {
    await fetch('/logout', {
      method: 'POST',
      headers: {
        'X-CSRF-Token': getCookie('csrf_token') || '',
        'X-API-Version': '1',
      },
    })
  } catch {}

  window.location.href = '/login.html'
}

createRoot(document.getElementById('root')).render(<App />)
