import { useEffect, useMemo, useState } from 'react'
import { updateProfile, checkNicknameAvailability } from '../api/auth'
import { fetchUserActivity } from '../api/expenses'
import { submitQuestion, submitSupportRequest } from '../api/support'

const formatDateTime = (value) => {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

const DEFAULT_ACTIVITY = {
  weekly_uploads: 0,
  monthly_uploads: 0,
  saved_documents: 0,
}

export default function MyPage({ token, profile, onToast, onProfileUpdate }) {
  const initialName = profile?.nickname || profile?.name || profile?.email || ''
  const [displayName, setDisplayName] = useState(initialName)
  const [nicknameInput, setNicknameInput] = useState(initialName)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [activity, setActivity] = useState(DEFAULT_ACTIVITY)
  const [recentDocs, setRecentDocs] = useState([])
  const [activityError, setActivityError] = useState('')
  const [activityLoading, setActivityLoading] = useState(false)
  const [questionForm, setQuestionForm] = useState({ title: '', content: '' })
  const [requestForm, setRequestForm] = useState({ title: '', description: '' })
  const [supportMessage, setSupportMessage] = useState('')
  const [supportError, setSupportError] = useState('')
  const [nicknameStatus, setNicknameStatus] = useState('')
  const [nicknameStatusType, setNicknameStatusType] = useState('hint')

  useEffect(() => {
    const next = profile?.nickname || profile?.name || profile?.email || ''
    setDisplayName(next)
    setNicknameInput(next)
  }, [profile?.nickname, profile?.name, profile?.email])

  useEffect(() => {
    if (!token) return
    setActivityLoading(true)
    fetchUserActivity(token)
      .then((data) => {
        setActivity(data?.summary || DEFAULT_ACTIVITY)
        setRecentDocs(data?.recent || [])
      })
      .catch((err) => {
        setActivityError(err.message || '활동 정보를 불러오지 못했습니다.')
      })
      .finally(() => {
        setActivityLoading(false)
      })
  }, [token])

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setAvatarPreview(url)
  }

  const handleNicknameSave = async (event) => {
    event.preventDefault()
    if (!token) {
      onToast?.('로그인 후 이용하세요.', 'error')
      return
    }
    if (!nicknameInput?.trim()) {
      onToast?.('닉네임을 입력하세요.', 'error')
      return
    }
    try {
      const updated = await updateProfile(token, { nickname: nicknameInput })
      const nextName = updated?.nickname || nicknameInput
      setDisplayName(nextName)
      setNicknameInput(nextName)
      onProfileUpdate?.(updated)
      onToast?.('닉네임을 저장했습니다.')
      setNicknameStatus('닉네임을 저장했습니다.')
      setNicknameStatusType('success')
    } catch (err) {
      onToast?.(err.message || '닉네임을 저장하지 못했습니다.', 'error')
      setNicknameStatus(err.message || '닉네임을 저장하지 못했습니다.')
      setNicknameStatusType('error')
    }
  }

  const handleNicknameCheck = async () => {
    if (!token) {
      onToast?.('로그인 후 이용하세요.', 'error')
      return
    }
    if (!nicknameInput?.trim()) {
      setNicknameStatus('닉네임을 입력하세요.')
      setNicknameStatusType('error')
      return
    }
    try {
      const result = await checkNicknameAvailability(token, nicknameInput.trim())
      if (result?.available) {
        setNicknameStatus('사용 가능한 닉네임입니다.')
        setNicknameStatusType('success')
      } else {
        setNicknameStatus('이미 사용 중인 닉네임입니다.')
        setNicknameStatusType('error')
      }
    } catch (err) {
      setNicknameStatus(err.message || '닉네임을 확인하지 못했습니다.')
      setNicknameStatusType('error')
    }
  }

  const handleQuestionSubmit = async (event) => {
    event.preventDefault()
    if (!token) {
      setSupportError('로그인 후 이용하세요.')
      return
    }
    if (!questionForm.title || !questionForm.content) {
      setSupportError('문의 제목과 내용을 모두 입력하세요.')
      return
    }
    try {
      setSupportError('')
      setSupportMessage('')
      await submitQuestion(token, questionForm)
      setSupportMessage('문의가 등록되었습니다.')
      setQuestionForm({ title: '', content: '' })
    } catch (err) {
      setSupportError(err.message || '문의 등록에 실패했습니다.')
    }
  }

  const handleRequestSubmit = async (event) => {
    event.preventDefault()
    if (!token) {
      setSupportError('로그인 후 이용하세요.')
      return
    }
    if (!requestForm.title || !requestForm.description) {
      setSupportError('요청 제목과 세부 내용을 입력하세요.')
      return
    }
    try {
      setSupportError('')
      setSupportMessage('')
      await submitSupportRequest(token, requestForm)
      setSupportMessage('요청 사항을 전달했습니다.')
      setRequestForm({ title: '', description: '' })
    } catch (err) {
      setSupportError(err.message || '요청을 전달하지 못했습니다.')
    }
  }

  const activityCards = useMemo(
    () => [
      { label: '이번 주 업로드', value: activity.weekly_uploads || 0, suffix: '건' },
      { label: '이번 달 업로드', value: activity.monthly_uploads || 0, suffix: '건' },
      { label: '저장된 문서', value: activity.saved_documents || 0, suffix: '건' },
    ],
    [activity]
  )

  if (!token) {
    return (
      <div className="mypage">
        <section className="panel">
          <p className="error">마이페이지는 로그인 후 이용할 수 있습니다.</p>
        </section>
      </div>
    )
  }

  const avatarInitial = (displayName || profile?.email || 'P')[0]?.toUpperCase()

  return (
    <div className="mypage">
      <div className="mypage-shell">
        <section className="profile-hero">
          <div className="profile-hero__photo">
            {avatarPreview ? <img src={avatarPreview} alt="avatar" /> : <span>{avatarInitial}</span>}
            <label className="avatar-upload">
              사진 추가
              <input type="file" accept="image/*" onChange={handleAvatarChange} />
            </label>
          </div>
          <div className="profile-hero__body">
            <h2>{displayName || profile?.email}</h2>
            {profile?.email && <span className="email-pill">{profile.email}</span>}
          </div>
          <form className="profile-form" onSubmit={handleNicknameSave}>
            <div className="profile-form__field">
              <span className="profile-form__label">닉네임</span>
              <div className="profile-form__row">
                <input
                  type="text"
                  value={nicknameInput}
                  onChange={(event) => {
                    setNicknameInput(event.target.value)
                    setNicknameStatus('')
                  }}
                  placeholder="닉네임을 입력하세요"
                />
                <div className="profile-form__actions">
                  <button type="button" className="btn ghost slim" onClick={handleNicknameCheck}>
                    중복 확인
                  </button>
                  <button type="submit" className="btn primary slim">
                    닉네임 저장
                  </button>
                </div>
              </div>
              {nicknameStatus && (
                <p className={`profile-form__status ${nicknameStatusType}`}>{nicknameStatus}</p>
              )}
            </div>
          </form>
        </section>

        <section className="panel activity-panel">
          <div className="panel-header">
            <span>활동 요약</span>
            {activityLoading && <span className="nano muted">불러오는 중...</span>}
          </div>
          {activityError && <p className="hint">활동 통계를 아직 불러오지 못했습니다.</p>}
          <div className="mypage-card-grid">
            {activityCards.map((card) => (
              <div key={card.label} className="mypage-card">
                <span className="nano muted">{card.label}</span>
                <strong>
                  {card.value}
                  <span className="nano muted">{card.suffix}</span>
                </strong>
              </div>
            ))}
          </div>
          <div className="recent-docs">
            <h4>최근 업로드</h4>
            {recentDocs.length === 0 && <p className="hint">최근 업로드가 없습니다.</p>}
            {recentDocs.map((doc) => (
              <div key={doc.id} className="recent-doc">
                <div>
                  <p className="recent-doc__merchant">{doc.merchant || '가맹점 미기입'}</p>
                  <p className="nano muted">{formatDateTime(doc.created_at)}</p>
                </div>
                <div className="recent-doc__meta">
                  <span>{doc.amount_text || '-'}</span>
                  <span className={`status-pill status-${doc.status || 'saved'}`}>{doc.status || 'saved'}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel support-panel">
          <h3>문의 & 요청</h3>
          <div className="support-grid">
            <form className="support-card" onSubmit={handleQuestionSubmit}>
              <h4>Q&A 문의</h4>
              <label>
                <span>제목</span>
                <input
                  type="text"
                  value={questionForm.title}
                  onChange={(event) => setQuestionForm((prev) => ({ ...prev, title: event.target.value }))}
                />
              </label>
              <label>
                <span>내용</span>
                <textarea
                  rows={4}
                  value={questionForm.content}
                  onChange={(event) => setQuestionForm((prev) => ({ ...prev, content: event.target.value }))}
                />
              </label>
              <button type="submit" className="btn primary">
                문의 등록
              </button>
            </form>

            <form className="support-card" onSubmit={handleRequestSubmit}>
              <h4>요청 사항</h4>
              <label>
                <span>요청 제목</span>
                <input
                  type="text"
                  value={requestForm.title}
                  onChange={(event) => setRequestForm((prev) => ({ ...prev, title: event.target.value }))}
                />
              </label>
              <label>
                <span>상세 내용</span>
                <textarea
                  rows={4}
                  value={requestForm.description}
                  onChange={(event) =>
                    setRequestForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                />
              </label>
              <button type="submit" className="btn primary">
                요청 전송
              </button>
            </form>
          </div>
          {supportMessage && <p className="success">{supportMessage}</p>}
          {supportError && <p className="error">{supportError}</p>}
        </section>
      </div>
    </div>
  )
}
