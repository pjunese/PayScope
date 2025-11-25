import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchProfile,
  fetchProviders,
  login,
  logout,
  signup,
  startOAuth,
  API_ORIGIN,
  fetchOAuthStatus,
} from '../api/auth'

const initialFormState = {
  email: '',
  password: '',
  name: '',
}

const OAUTH_BROADCAST_CHANNEL = 'spendmate-oauth'
const OAUTH_STORAGE_PREFIX = 'spendmate:oauth:'

export default function AuthPanel({ onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState(initialFormState)
  const [providers, setProviders] = useState(null)
  const [token, setToken] = useState(() =>
    typeof window !== 'undefined' ? window.localStorage.getItem('token') : null
  )
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isOAuthLoading, setIsOAuthLoading] = useState(false)
  const pendingStateRef = useRef(null)
  const popupRef = useRef(null)
  const pollTimerRef = useRef(null)
  const allowedOrigins = useMemo(() => {
    const origins = [API_ORIGIN]
    if (typeof window !== 'undefined') {
      const current = window.location.origin
      origins.push(current)
      try {
        const url = new URL(current)
        if (url.hostname === 'localhost') {
          origins.push(`${url.protocol}//127.0.0.1${url.port ? `:${url.port}` : ''}`)
        } else if (url.hostname === '127.0.0.1') {
          origins.push(`${url.protocol}//localhost${url.port ? `:${url.port}` : ''}`)
        }
      } catch {
        // ignore malformed origins
      }
    }
    return Array.from(new Set(origins.filter(Boolean)))
  }, [])

  const clearOAuthFlow = useCallback(() => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close()
    }
    popupRef.current = null
    pendingStateRef.current = null
    setIsOAuthLoading(false)
  }, [])

  const finalizeOAuth = useCallback(
    (raw) => {
      if (!raw) return
      const kind = raw.type
      const normalized =
        kind === 'oauth-success'
          ? { token: raw.token, user: raw.user, error: null }
          : kind === 'oauth-error'
            ? { token: null, user: null, error: raw.error || '간편 로그인에 실패했습니다.' }
            : raw

      if (normalized.error) {
        setError(normalized.error)
        clearOAuthFlow()
        return
      }

      if (normalized.token && normalized.user) {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('token', normalized.token)
        }
        setToken(normalized.token)
        setProfile(normalized.user)
        onAuthenticated(normalized.token, normalized.user)
        setError('')
        clearOAuthFlow()
      }
    },
    [clearOAuthFlow, onAuthenticated],
  )

  const handleInboundOAuthPayload = useCallback(
    (payload) => {
      if (!payload || typeof payload !== 'object') return
      const expectedState = pendingStateRef.current
      const incomingState = payload.state
      if (expectedState && incomingState && expectedState !== incomingState) {
        return
      }
      finalizeOAuth(payload)
    },
    [finalizeOAuth],
  )

  useEffect(() => {
    fetchProviders()
      .then((data) => setProviders(data))
      .catch(() => setProviders({}))
  }, [])

  useEffect(() => {
    const handleMessage = (event) => {
      if (!event.data || typeof event.data !== 'object') return
      if (!allowedOrigins.includes(event.origin) && event.origin !== API_ORIGIN && event.origin !== '*') return
      handleInboundOAuthPayload(event.data)
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [allowedOrigins, handleInboundOAuthPayload])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
      return undefined
    }
    let channel
    try {
      channel = new BroadcastChannel(OAUTH_BROADCAST_CHANNEL)
      channel.onmessage = (event) => handleInboundOAuthPayload(event.data)
    } catch {
      // BroadcastChannel not supported
    }
    return () => {
      if (channel) {
        channel.close()
      }
    }
  }, [handleInboundOAuthPayload])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleStorage = (event) => {
      if (!event.key || !event.key.startsWith(OAUTH_STORAGE_PREFIX)) return
      if (!event.newValue) return
      try {
        const parsed = JSON.parse(event.newValue)
        handleInboundOAuthPayload(parsed.payload || parsed)
      } catch {
        // ignore malformed payloads
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [handleInboundOAuthPayload])

  useEffect(
    () => () => {
      clearOAuthFlow()
    },
    [clearOAuthFlow],
  )

  useEffect(() => {
    if (!token) {
      setProfile(null)
      onAuthenticated(null, null)
      clearOAuthFlow()
      return
    }

    fetchProfile(token)
      .then((data) => {
        setProfile(data)
        onAuthenticated(token, data)
      })
      .catch(() => {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('token')
        }
        setToken(null)
        setProfile(null)
        onAuthenticated(null, null)
      })
  }, [token, onAuthenticated, clearOAuthFlow])

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      const action = mode === 'login' ? login : signup
      const payload =
        mode === 'login'
          ? { email: form.email, password: form.password }
          : {
              email: form.email,
              password: form.password,
              name: form.name,
            }
      const result = await action(payload)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('token', result.token)
      }
      setToken(result.token)
      setProfile(result.user)
      setForm(initialFormState)
      onAuthenticated(result.token, result.user)
    } catch (authError) {
      setError(authError.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    if (!token) return
    await logout(token).catch(() => {})
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('token')
    }
    setToken(null)
    setProfile(null)
    onAuthenticated(null, null)
    clearOAuthFlow()
  }

  const renderOAuthLinks = () => {
    if (!providers) return null
    const entries = Object.entries(providers).filter(
      ([, value]) => value?.client_id && value?.callback_url
    )
    if (!entries.length) return null

    return (
      <div className="social-links">
        <p>또는 간편 로그인</p>
        <div className="social-buttons">
          {entries.map(([provider]) => (
            <button
              type="button"
              key={provider}
              className={`social-button social-${provider}`}
              onClick={() => handleOAuth(provider)}
              disabled={isOAuthLoading}
            >
              {provider === 'google' ? 'Google로 계속하기' : 'Naver로 계속하기'}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const handleOAuth = async (provider) => {
    setError('')
    setIsOAuthLoading(true)
    try {
      const { auth_url: authUrl, state } = await startOAuth(provider)
      const popup = window.open(authUrl, `${provider}-oauth`, 'width=500,height=700')
      if (!popup) {
        throw new Error('팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요.')
      }
      popupRef.current = popup
      pendingStateRef.current = state
      pollTimerRef.current = window.setInterval(async () => {
        try {
          const result = await fetchOAuthStatus(state)
          if (!result) {
            return
          }
          finalizeOAuth(result)
        } catch (pollError) {
          setError(pollError.message)
          clearOAuthFlow()
        }
      }, 1500)
    } catch (oauthError) {
      setError(oauthError.message)
      clearOAuthFlow()
    }
  }

  if (profile) {
    return (
      <div className="auth-panel">
        <div className="auth-row">
          <span className="greeting">
            안녕하세요, <strong>{profile.name || profile.email}</strong>님
          </span>
          <button type="button" onClick={handleLogout} className="secondary">
            로그아웃
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-panel">
      <div className="auth-tabs">
        <button
          type="button"
          className={mode === 'login' ? 'active' : ''}
          onClick={() => setMode('login')}
        >
          이메일 로그인
        </button>
        <button
          type="button"
          className={mode === 'signup' ? 'active' : ''}
          onClick={() => setMode('signup')}
        >
          회원가입
        </button>
      </div>
      <form onSubmit={handleSubmit} className="auth-form">
        <label>
          이메일
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            required
          />
        </label>
        {mode === 'signup' && (
          <label>
            이름 (선택)
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="이름을 입력하세요"
            />
          </label>
        )}
        <label>
          비밀번호
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            required
            minLength={8}
          />
        </label>
        <button type="submit" className="primary" disabled={isLoading}>
          {isLoading
            ? '처리 중...'
            : mode === 'login'
              ? '이메일로 로그인'
              : '회원가입 완료'}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
      {renderOAuthLinks()}
    </div>
  )
}
