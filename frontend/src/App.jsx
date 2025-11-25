import { useEffect, useMemo, useRef, useState } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation, Link } from 'react-router-dom'
import './App.css'
import {
  login as apiLogin,
  signup as apiSignup,
  startOAuth,
  fetchProviders,
  fetchOAuthStatus,
  fetchProfile,
} from './api/auth'
import { fetchLatestExpense } from './api/expenses'
import Dashboard from './components/Dashboard'
import AdminUsersPage from './pages/AdminUsers'
import AdminExpensesPage from './pages/AdminExpenses'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'
const DRAFT_STORAGE_KEY = 'spendmate:draft'

const FIELD_DEFINITIONS = [
  { key: 'merchant', label: '가맹점' },
  { key: 'quantity', label: '수량' },
  { key: 'amount', label: '결제금액' },
  { key: 'date', label: '날짜' },
]

const CATEGORY_OPTIONS = [
  '',
  '식비',
  '카페/간식',
  '교통',
  '주거/관리',
  '쇼핑',
  '엔터테인먼트',
  '교육',
  '여행',
  '의료/건강',
  '기타',
]

const buildInitialSelections = () =>
  FIELD_DEFINITIONS.reduce((acc, field) => ({ ...acc, [field.key]: '' }), {})

function LoginModal({ open, onClose, onLogin, onSignup, authState, providers, onSocial }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [mode, setMode] = useState('login')

  useEffect(() => {
    if (open) {
      setMode('login')
      setEmail('')
      setPassword('')
      setName('')
    }
  }, [open])

  if (!open) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    if (mode === 'signup') {
      onSignup?.({ email, password, name })
    } else {
      onLogin({ email, password })
    }
  }

  const socialButtonClass = (provider) => {
    const enabled = Boolean(providers?.[provider])
    return `social-btn social-${provider} ${enabled ? 'active' : ''}`.trim()
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="login-card pretty">
        <button className="modal-close" type="button" onClick={onClose} aria-label="닫기">
          ×
        </button>
        <h2>로그인</h2>
        <div className="login-tabs" role="tablist">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => setMode('login')}
            role="tab"
            aria-selected={mode === 'login'}
          >
            로그인
          </button>
          <button
            type="button"
            className={mode === 'signup' ? 'active' : ''}
            onClick={() => setMode('signup')}
            role="tab"
            aria-selected={mode === 'signup'}
          >
            회원가입
          </button>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field">
            <span>이메일</span>
            <input
              type="email"
              placeholder="이메일을 입력하세요"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          {mode === 'signup' && (
            <label className="login-field">
              <span>이름 (선택)</span>
              <input
                type="text"
                placeholder="표시 이름을 입력하세요"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          <label className="login-field">
            <span>비밀번호</span>
            <input
              type="password"
              placeholder="비밀번호를 입력하세요"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="login-submit gradient" disabled={authState.loading}>
            {authState.loading ? '처리 중...' : mode === 'signup' ? '회원가입' : '로그인'}
          </button>
          {authState.error && <p className="error">{authState.error}</p>}
          <div className="login-divider">
            <span>또는</span>
          </div>
          <button
            type="button"
            className={socialButtonClass('google')}
            disabled={!providers?.google}
            onClick={() => onSocial('google')}
          >
            Google로 로그인
          </button>
          <button
            type="button"
            className={socialButtonClass('naver')}
            disabled={!providers?.naver}
            onClick={() => onSocial('naver')}
          >
            Naver로 로그인
          </button>
          {mode === 'login' ? (
            <p className="signup-text">
              계정이 없으신가요? <button type="button" className="inline-link" onClick={() => setMode('signup')}>회원가입</button>
            </p>
          ) : (
            <p className="signup-text">
              이미 계정이 있으신가요? <button type="button" className="inline-link" onClick={() => setMode('login')}>로그인</button>
            </p>
          )}
        </form>
      </div>
    </div>
  )
}

function LandingPage({
  hiddenInput,
  handleFilePick,
  handleUpload,
  onCancelUpload,
  fileName,
  isLoading,
  error,
  statusMessage,
  draft,
  onResumeDraft,
  onDiscardDraft,
  onResumeSaved,
  latestLoading,
}) {
  return (
    <section id="hero" className="hero">
      <div className="hero-grid">
        <div className="hero-card" aria-label="Upload">
          {draft && (
            <div className="draft-banner">
              <div>
                <strong>저장되지 않은 작업이 있습니다.</strong>
                <span className="nano muted">
                  마지막 수정 {new Date(draft.timestamp).toLocaleString()}
                </span>
              </div>
              <div className="draft-banner__actions">
                <button type="button" className="btn primary" onClick={onResumeDraft}>
                  이어하기
                </button>
                <button type="button" className="btn ghost" onClick={onDiscardDraft}>
                  삭제
                </button>
              </div>
            </div>
          )}
          <div className="panel-header">
            <span>이미지 업로드</span>
            <span className="pill">Live OCR</span>
          </div>
          <input
            ref={hiddenInput}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFilePick}
          />
          <div className="upload" onClick={() => hiddenInput.current?.click()}>
            <strong>이미지 드롭 또는 클릭</strong>
            <div className="nano">PNG · JPG · HEIC 지원</div>
            {fileName && <div className="uploaded-name">{fileName}</div>}
          </div>
          <div className="upload-actions" style={{ gap: '10px' }}>
            <button className="btn primary" type="button" onClick={() => hiddenInput.current?.click()}>
              이미지 올리기
            </button>
            <button className="btn ghost" type="button" onClick={handleUpload}>
              추출하기
            </button>
          </div>
          {isLoading && (
            <div className="loading-bar-row">
              <div className="loading-bar" aria-label="업로드 중">
                <div className="loading-bar__fill" />
              </div>
              <button type="button" className="btn ghost cancel-upload" onClick={onCancelUpload}>
                취소
              </button>
            </div>
          )}
          {error && <p className="error">{error}</p>}
          {statusMessage && <p className="hint">{statusMessage}</p>}

          <div className="panel-header" style={{ marginTop: 12 }}>
            <span>샘플 결과</span>
            <span className="pill">Preview</span>
          </div>
          <div className="sample-card">
            <div className="sample-row">
              <span>Merchant</span>
              <span>
                <strong>Blue Bottle</strong>
              </span>
            </div>
            <div className="sample-row">
              <span>Amount</span>
              <span>6,500 원</span>
            </div>
            <div className="sample-row">
              <span>Date</span>
              <span>2024-11-02 13:07:17</span>
            </div>
            <div className="sample-row">
              <span>Account</span>
              <span>3333-12-4567**</span>
            </div>
            <div className="sample-row">
              <span>Confidence</span>
              <span className="badge">PaddleOCR + OpenCV</span>
            </div>
          </div>

          <div className="panel-header" style={{ marginTop: 12 }}>
            <span>최근 저장본</span>
            <span className="pill">Resume</span>
          </div>
          <div className="sample-card">
            <div className="sample-row">
              <span>이전 결과를 다시 편집할 수 있습니다.</span>
            </div>
            <button type="button" className="btn ghost" onClick={onResumeSaved} disabled={latestLoading}>
              {latestLoading ? '불러오는 중...' : '최근 저장본 불러오기'}
            </button>
          </div>
        </div>

        <div className="hero-card" aria-label="Placeholder"></div>
      </div>
    </section>
  )
}

function ResultView({
  ocrResult,
  selections,
  category,
  setCategory,
  splitMode,
  participantCount,
  customShare,
  formattedEqualShare,
  totalAmountDisplay,
  selectedSummary,
  isSaving,
  saveMessage,
  error,
  onBack,
  onToggle,
  onSave,
  onSplitModeChange,
  onParticipantChange,
  onCustomShareChange,
  onSelectionEdit,
}) {
  const scrollTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  return (
    <div className="app process">
      <div className="process-topbar">
        <button type="button" className="ghost-btn" onClick={() => { onBack(); scrollTop() }}>
          ← 랜딩으로
        </button>
      </div>
      <header>
        <h1>추출 결과 확인</h1>
        <p>추출된 텍스트에서 원하는 필드를 지정하세요.</p>
      </header>

      {error && <p className="error">{error}</p>}

      <section className="panel">
        <h2>1. 추출된 문장</h2>
        <p className="hint">각 행에서 원하는 정보를 선택하세요. 다시 클릭하면 선택이 해제됩니다.</p>
        <div className="lines-table">
          <div className="lines-header">
            <span>텍스트</span>
            {FIELD_DEFINITIONS.map((field) => (
              <span key={field.key}>{field.label}</span>
            ))}
          </div>
          <div className="lines-body">
            {ocrResult.lines?.map((line, index) => (
              <div className="line-row" key={`${line.text}-${index}`}>
                <span className="line-text">{line.text}</span>
                {FIELD_DEFINITIONS.map((field) => (
                  <label key={field.key} className="checkbox-cell" title={`${field.label}로 지정`}>
                    <input
                      type="checkbox"
                      checked={selections[field.key] === line.text}
                      onChange={() => onToggle(field.key, line.text)}
                    />
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>2. 선택 결과</h2>
        <div className="selection-summary">
          <ul>
            {selectedSummary.map((entry) =>
              entry.type === 'category' ? (
                <li key={entry.key}>
                  <strong>{entry.label}</strong>
                  <select
                    id="category-select"
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option || 'empty'} value={option}>
                        {option || '선택 안 함'}
                      </option>
                    ))}
                  </select>
                </li>
              ) : (
                <li key={entry.key}>
                  <strong>{entry.label}</strong>
                  <input
                    type="text"
                    value={entry.value || ''}
                    placeholder="미선택"
                    onChange={(event) => onSelectionEdit(entry.key, event.target.value)}
                  />
                </li>
              ),
            )}
          </ul>
          <div className="split-card">
            <h3>분담 설정</h3>
            <div className="split-row">
              <span>총 결제금액</span>
              <strong>{totalAmountDisplay}</strong>
            </div>
            <div className="split-mode">
              <label>
                <input
                  type="radio"
                  name="split-mode"
                  value="equal"
                  checked={splitMode === 'equal'}
                  onChange={onSplitModeChange}
                />
                N분의 1로 나눌래요
              </label>
              <label>
                <input
                  type="radio"
                  name="split-mode"
                  value="custom"
                  checked={splitMode === 'custom'}
                  onChange={onSplitModeChange}
                />
                내가 부담금을 직접 입력할래요
              </label>
            </div>

            {splitMode === 'equal' ? (
              <>
                <label className="split-row">
                  <span>참여 인원</span>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={participantCount}
                    onChange={onParticipantChange}
                  />
                </label>
                <div className="split-row">
                  <span>1인 부담금</span>
                  <strong>
                    {formattedEqualShare !== null
                      ? `${formattedEqualShare}원`
                      : '결제금액을 선택하세요'}
                  </strong>
                </div>
              </>
            ) : (
              <>
                <label className="split-row">
                  <span>내 부담금</span>
                  <input
                    type="text"
                    value={customShare}
                    onChange={onCustomShareChange}
                    placeholder="금액을 입력하세요"
                  />
                </label>
                {formattedEqualShare !== null && (
                  <p className="split-hint">참고 자동 계산: {formattedEqualShare}원</p>
                )}
              </>
            )}
          </div>
        </div>
        <details className="raw-text">
          <summary>원본 텍스트 보기</summary>
          <pre>{ocrResult.raw_text || '텍스트 없음'}</pre>
        </details>
        <div className="selection-actions">
          <button type="button" className="primary" onClick={onSave} disabled={isSaving}>
            {isSaving ? '저장 중...' : '선택한 정보 저장'}
          </button>
          {saveMessage && <p className="success">{saveMessage}</p>}
        </div>
      </section>
    </div>
  )
}

function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const [file, setFile] = useState(null)
  const [fileName, setFileName] = useState('')
  const hiddenInput = useRef(null)
  const [token, setToken] = useState(() =>
    typeof window !== 'undefined' ? window.localStorage.getItem('token') : null
  )
  const [profile, setProfile] = useState(null)
  const [showLogin, setShowLogin] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [providers, setProviders] = useState({ google: true, naver: true })
  const [authState, setAuthState] = useState({ loading: false, error: '' })
  const oauthPollRef = useRef(null)

  const [ocrResult, setOcrResult] = useState(null)
  const [documentId, setDocumentId] = useState(null)
  const [selections, setSelections] = useState(buildInitialSelections)
  const [category, setCategory] = useState('')
  const [splitMode, setSplitMode] = useState('equal')
  const [participantCount, setParticipantCount] = useState(1)
  const [customShare, setCustomShare] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [oauthState, setOauthState] = useState(null)
  const [draftData, setDraftData] = useState(null)
  const [isLoadingLatestSaved, setIsLoadingLatestSaved] = useState(false)
  const [toasts, setToasts] = useState([])
  const [uploadController, setUploadController] = useState(null)
  const isAdminUser = profile?.role === 'admin' || profile?.role === 'subadmin'
  const navClass = (path, exact = true) => {
    if (exact) return location.pathname === path ? 'active' : ''
    return location.pathname.startsWith(path) ? 'active' : ''
  }

  const resetOAuth = () => {
    if (oauthPollRef.current) {
      clearInterval(oauthPollRef.current)
      oauthPollRef.current = null
    }
    setOauthState(null)
    setAuthState((prev) => ({ ...prev, loading: false }))
  }

  const handleOAuthPayload = (payload) => {
    if (!payload || typeof payload !== 'object') return
    if (oauthState && payload.state && payload.state !== oauthState) return
    // Debug aid: surface unexpected payloads
    console.log('OAuth payload received', payload)
    if (payload.error) {
      setAuthState({ loading: false, error: payload.error })
      return
    }
    if (payload.token && payload.user) {
      handleAuth(payload.token, payload.user)
      setAuthState({ loading: false, error: '' })
    }
  }

  useEffect(() => {
    const handleMessage = (event) => {
      if (!event.data || typeof event.data !== 'object') return
      handleOAuthPayload(event.data)
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [oauthState])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      if (parsed?.documentId && parsed?.ocrResult) {
        setDraftData(parsed)
      }
    } catch {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!ocrResult || !documentId) return
    const payload = {
      timestamp: Date.now(),
      documentId,
      ocrResult,
      selections,
      category,
      splitMode,
      participantCount,
      customShare,
    }
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload))
    setDraftData(payload)
  }, [ocrResult, documentId, selections, category, splitMode, participantCount, customShare])

  useEffect(() => {
    fetchProviders()
      .then((data) => setProviders(data))
      .catch(() => setProviders({ google: true, naver: true }))
  }, [])

  useEffect(() => {
    if (!token) return
    fetchProfile(token)
      .then((data) => {
        setProfile(data)
      })
      .catch(() => {
        if (typeof window !== 'undefined') window.localStorage.removeItem('token')
        setToken(null)
        setProfile(null)
      })
  }, [token])

  const handleAuth = (nextToken, user) => {
    if (nextToken) {
      if (typeof window !== 'undefined') window.localStorage.setItem('token', nextToken)
      setToken(nextToken)
      setProfile(user)
      setShowLogin(false)
      setError('')
    } else {
      if (typeof window !== 'undefined') window.localStorage.removeItem('token')
      setToken(null)
      setProfile(null)
    }
  }

  const handleFilePick = (event) => {
    const next = event.target.files?.[0]
    setFile(next || null)
    setFileName(next ? next.name : '')
    setError('')
  }

  const handleLogout = () => {
    resetOAuth()
    if (typeof window !== 'undefined') window.localStorage.removeItem('token')
    setToken(null)
    setProfile(null)
  }

  const handleBackToLanding = () => {
    setOcrResult(null)
    setDocumentId(null)
    setSaveMessage('')
    setStatusMessage('')
    navigate('/')
  }

  const handleResumeDraft = () => {
    if (!draftData) return
    setOcrResult(draftData.ocrResult)
    setDocumentId(draftData.documentId)
    setSelections(draftData.selections || buildInitialSelections())
    setCategory(draftData.category || '')
    setSplitMode(draftData.splitMode || 'equal')
    setParticipantCount(draftData.participantCount || 1)
    setCustomShare(draftData.customShare || '')
    setStatusMessage('이전 작업을 불러왔습니다.')
    navigate('/result')
  }

  const showToast = (message, variant = 'success') => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev, { id, message, variant }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, 3000)
  }

  const handleDiscardDraft = () => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(DRAFT_STORAGE_KEY)
    setDraftData(null)
  }

  const applyExternalDocument = (payload, message) => {
    if (!payload?.ocr || !payload?.id) {
      setError('불러온 문서가 올바르지 않습니다.')
      return
    }
    const selection = payload.selection || {}
    setOcrResult(payload.ocr || null)
    setDocumentId(payload.id)
    setSelections({
      merchant: selection.merchant || '',
      quantity: selection.quantity || '',
      amount: selection.amount_text || '',
      date: selection.date_text || '',
    })
    setCategory(selection.category || '')
    setSplitMode(selection.split_mode || 'equal')
    setParticipantCount(selection.participant_count || 1)
    setCustomShare(selection.custom_share || '')
    setStatusMessage(message)
    navigate('/result')
  }

  const handleResumeLatestSaved = async () => {
    if (!token) {
      setError('최근 저장본을 불러오려면 로그인하세요.')
      setShowLogin(true)
      return
    }
    setIsLoadingLatestSaved(true)
    try {
      const payload = await fetchLatestExpense(token)
      if (!payload) {
        setStatusMessage('불러올 저장본이 없습니다.')
        return
      }
      applyExternalDocument(payload, '최근 저장본을 불러왔습니다.')
    } catch (fetchError) {
      setError(fetchError.message ?? '최근 저장본을 불러오지 못했습니다.')
    } finally {
      setIsLoadingLatestSaved(false)
    }
  }

  const handleUpload = async () => {
    if (!file) {
      setError('이미지 파일을 먼저 선택하세요.')
      return
    }
    if (!token) {
      setError('로그인이 필요합니다.')
      setShowLogin(true)
      return
    }

    setIsLoading(true)
    setError('')
    setStatusMessage('업로드 및 추출 중...')
    setOcrResult(null)
    setDocumentId(null)
    setSaveMessage('')

    const formData = new FormData()
    formData.append('file', file)

    const controller = new AbortController()
    setUploadController(controller)

    try {
      const response = await fetch(`${API_BASE}/api/expenses/upload/`, {
        method: 'POST',
        body: formData,
        headers: { Authorization: `Token ${token}` },
        signal: controller.signal,
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        const message =
          payload?.detail ??
          `업로드가 실패했습니다. (${response.status} ${response.statusText})`
        throw new Error(message)
      }
      const payload = await response.json()
      setOcrResult(payload.ocr ?? null)
      setDocumentId(payload.id ?? null)
      setSelections(buildInitialSelections())
      setCategory('')
      setSplitMode('equal')
      setParticipantCount(1)
      setCustomShare('')
      setSaveMessage('')
      setStatusMessage('추출이 완료되었습니다.')
      navigate('/result')
    } catch (fetchError) {
      if (fetchError.name === 'AbortError') {
        setError('업로드를 취소했습니다.')
        setStatusMessage('')
      } else {
        setError(fetchError.message ?? '알 수 없는 오류가 발생했습니다.')
      }
    } finally {
      setIsLoading(false)
      setUploadController(null)
    }
  }

  const handleCancelUpload = () => {
    if (uploadController) {
      uploadController.abort()
      setUploadController(null)
    }
  }

  const toggleSelection = (fieldKey, value) => {
    setSelections((prev) => {
      const currentValue = prev[fieldKey]
      const nextValue = currentValue === value ? '' : value
      return { ...prev, [fieldKey]: nextValue }
    })
  }

  const selectedSummary = useMemo(
    () => [
      { key: 'merchant', label: '가맹점', value: selections.merchant, type: 'text' },
      { key: 'quantity', label: '수량', value: selections.quantity, type: 'text' },
      { key: 'amount', label: '결제금액', value: selections.amount, type: 'text' },
      { key: 'date', label: '날짜', value: selections.date, type: 'text' },
      { key: 'category', label: '카테고리', value: category || '', type: 'category' },
    ],
    [category, selections]
  )

  const parseAmount = (value) => {
    if (!value) return null
    const normalized = value.replace(/[^\d.-]/g, '')
    if (!normalized) return null
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }

  const parseQuantity = (value) => {
    if (!value) return 1
    const normalized = value.replace(/[^\d]/g, '')
    if (!normalized) return 1
    const parsed = Number(normalized)
    if (!Number.isFinite(parsed) || parsed <= 0) return 1
    return parsed
  }

  const amountValue = useMemo(() => parseAmount(selections.amount), [selections.amount])
  const quantityValue = useMemo(() => parseQuantity(selections.quantity), [selections.quantity])

  const totalAmount = useMemo(() => {
    if (amountValue === null) return null
    return amountValue * quantityValue
  }, [amountValue, quantityValue])

  const formattedTotalAmount = useMemo(() => {
    if (totalAmount === null) return null
    return new Intl.NumberFormat('ko-KR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(totalAmount)
  }, [totalAmount])

  const totalAmountDisplay =
    formattedTotalAmount !== null
      ? `${formattedTotalAmount}원`
      : selections.amount || '미선택'

  const handleParticipantCountChange = (event) => {
    const next = Number(event.target.value)
    if (Number.isNaN(next) || next <= 0) {
      setParticipantCount(1)
      return
    }
    setParticipantCount(Math.min(99, Math.round(next)))
  }

  const equalShare = useMemo(() => {
    if (totalAmount === null || participantCount <= 0) return null
    return totalAmount / participantCount
  }, [participantCount, totalAmount])

  const formattedEqualShare = useMemo(() => {
    if (equalShare === null) return null
    return new Intl.NumberFormat('ko-KR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(equalShare)
  }, [equalShare])

  const handleSplitModeChange = (event) => {
    setSplitMode(event.target.value)
  }

  const handleCustomShareChange = (event) => {
    setCustomShare(event.target.value)
  }

  const handleSelectionInputChange = (fieldKey, value) => {
    setSelections((prev) => ({ ...prev, [fieldKey]: value }))
  }

  const handleSaveSelections = async () => {
    if (!documentId) {
      setError('먼저 이미지를 업로드하고 텍스트 추출을 완료하세요.')
      return
    }
    if (!token) {
      setError('지출을 저장하려면 로그인하세요.')
      setShowLogin(true)
      return
    }
    if (!selections.amount && !(splitMode === 'custom' && customShare)) {
      setError('결제금액을 선택한 뒤 저장할 수 있습니다.')
      return
    }
    setIsSaving(true)
    setError('')
    setSaveMessage('')
    try {
      const manualAmountValue = splitMode === 'custom' ? parseAmount(customShare) : null
      const amountValueForSave = manualAmountValue ?? totalAmount ?? null
      const amountTextForSave =
        splitMode === 'custom' && customShare ? customShare : selections.amount || ''

      const body = {
        document_id: documentId,
        merchant: selections.merchant || '',
        quantity: selections.quantity || '',
        amount_text: amountTextForSave,
        amount_value: amountValueForSave,
        date_text: selections.date || '',
        category: category || '',
        split_mode: splitMode,
        participant_count: participantCount,
        custom_share: splitMode === 'custom' ? customShare : null,
      }
      const response = await fetch(`${API_BASE}/api/expenses/confirm/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${token}`,
        },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        const message =
          payload?.detail ?? `지출 저장에 실패했습니다. (${response.status})`
        throw new Error(message)
      }
      setSaveMessage('지출 정보가 저장되었습니다.')
      if (typeof window !== 'undefined') window.localStorage.removeItem(DRAFT_STORAGE_KEY)
      setDraftData(null)
    } catch (saveError) {
      setError(saveError.message ?? '지출 저장 중 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <div className="page">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">S</div>
            <span>SpendMate OCR</span>
          </div>
          <nav aria-label="primary">
            <Link className={navClass('/')} to="/">
              Home
            </Link>
            <Link className={navClass('/dashboard', false)} to="/dashboard">
              Dashboard
            </Link>
            {isAdminUser && (
              <>
                <Link className={navClass('/admin/users', false)} to="/admin/users">
                  Admin Users
                </Link>
                <Link className={navClass('/admin/expenses', false)} to="/admin/expenses">
                  Admin Expenses
                </Link>
              </>
            )}
          </nav>
          <div className="nav-actions">
            {!token ? (
              <>
                <button className="btn ghost" type="button" onClick={() => setShowLogin(true)}>
                  Login
                </button>
                <button className="btn primary" type="button" onClick={() => setShowLogin(true)}>
                  Sign Up
                </button>
              </>
            ) : (
              <>
                <span className="nano">{profile?.email || 'Logged in'}</span>
                <button className="btn primary" type="button" onClick={handleLogout}>
                  Logout
                </button>
              </>
            )}
          </div>
        </header>

        <main className="content">
          <Routes>
            <Route
              path="/"
              element={
                <LandingPage
                  hiddenInput={hiddenInput}
                  handleFilePick={handleFilePick}
                  handleUpload={handleUpload}
                  onCancelUpload={handleCancelUpload}
                  fileName={fileName}
                  isLoading={isLoading}
                  error={error}
                  statusMessage={statusMessage}
                  draft={draftData}
                  onResumeDraft={handleResumeDraft}
                  onDiscardDraft={handleDiscardDraft}
                  onResumeSaved={handleResumeLatestSaved}
                  latestLoading={isLoadingLatestSaved}
                />
              }
            />
            <Route
              path="/result"
              element={
                ocrResult ? (
                  <ResultView
                    ocrResult={ocrResult}
                    selections={selections}
                    category={category}
                    setCategory={setCategory}
                    splitMode={splitMode}
                    participantCount={participantCount}
                    customShare={customShare}
                    formattedEqualShare={formattedEqualShare}
                    totalAmountDisplay={totalAmountDisplay}
                    selectedSummary={selectedSummary}
                    onSelectionEdit={handleSelectionInputChange}
                    isSaving={isSaving}
                    saveMessage={saveMessage}
                    error={error}
                    onBack={handleBackToLanding}
                    onToggle={toggleSelection}
                    onSave={handleSaveSelections}
                    onSplitModeChange={handleSplitModeChange}
                    onParticipantChange={handleParticipantCountChange}
                    onCustomShareChange={handleCustomShareChange}
                  />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route path="/dashboard" element={<Dashboard token={token} profile={profile} />} />
            <Route
              path="/admin/users"
              element={
                isAdminUser ? (
                  <AdminUsersPage token={token} profile={profile} onToast={showToast} />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/admin/expenses"
              element={
                isAdminUser ? (
                  <AdminExpensesPage token={token} isAdmin={isAdminUser} onToast={showToast} />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      <LoginModal
        open={showLogin}
        onClose={() => setShowLogin(false)}
        onLogin={async (payload) => {
          setAuthState({ loading: true, error: '' })
          try {
            const res = await apiLogin(payload)
            handleAuth(res.token, res.user)
          } catch (err) {
            setAuthState({ loading: false, error: err.message ?? '로그인에 실패했습니다.' })
            return
          }
          setAuthState({ loading: false, error: '' })
        }}
        onSignup={async (payload) => {
          setAuthState({ loading: true, error: '' })
          try {
            const res = await apiSignup(payload)
            handleAuth(res.token, res.user)
          } catch (err) {
            setAuthState({ loading: false, error: err.message ?? '회원가입에 실패했습니다.' })
            return
          }
          setAuthState({ loading: false, error: '' })
        }}
        authState={authState}
        providers={providers}
        onSocial={async (provider) => {
          // clear existing polling
          if (oauthPollRef.current) {
            clearInterval(oauthPollRef.current)
            oauthPollRef.current = null
          }
          setAuthState({ loading: true, error: '' })
          let popup = null
          try {
            popup = window.open('', `oauth-${provider}`, 'width=520,height=650')
            if (!popup || popup.closed || typeof popup.closed === 'undefined') {
              setAuthState({ loading: false, error: '팝업을 열 수 없습니다. 팝업 차단을 확인해주세요.' })
              return
            }
            const res = await startOAuth(provider)
            const url = res?.auth_url || res?.url || res?.redirect
            const state = res?.state || res?.oauth_state || res?.nonce
            if (!url || !state) {
              setAuthState({ loading: false, error: '간편 로그인 URL/state를 가져오지 못했습니다.' })
              popup.close()
              return
            }
            setOauthState(state)
            popup.location.href = url

            oauthPollRef.current = setInterval(async () => {
              try {
                const status = await fetchOAuthStatus(state)
                if (!status || !status.token) return
                console.log('OAuth status polled', status)
                handleOAuthPayload(status)
                clearInterval(oauthPollRef.current)
                oauthPollRef.current = null
                if (popup && !popup.closed) popup.close()
              } catch {
                /* ignore transient */
              }
            }, 1500)
          } catch (err) {
            setAuthState({ loading: false, error: err.message ?? '간편 로그인에 실패했습니다.' })
            if (popup && !popup.closed) popup.close()
          }
        }}
      />
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.variant}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </>
  )
}

export default App
