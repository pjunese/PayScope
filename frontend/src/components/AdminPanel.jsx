import { useEffect, useMemo, useState } from 'react'
import { fetchAdminUsers, updateUserRole } from '../api/auth'

const ROLE_LABELS = {
  admin: '관리자',
  subadmin: '부관리자',
  member: '일반회원',
}

const ROLE_OPTIONS = [
  { value: 'admin', label: '관리자' },
  { value: 'subadmin', label: '부관리자' },
  { value: 'member', label: '일반회원' },
]

export default function AdminPanel({ token, profile, onToast }) {
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [busyUserId, setBusyUserId] = useState(null)

  const canManageRoles = profile?.role === 'admin'
  const primaryAdminEmail = useMemo(() => import.meta.env.VITE_PRIMARY_ADMIN_EMAIL ?? 'pjunese99@gmail.com', [])

  useEffect(() => {
    if (!token) return
    loadUsers()
  }, [token])

  const loadUsers = async () => {
    if (!token) return
    setIsLoading(true)
    setError('')
    setNotice('')
    try {
      const data = await fetchAdminUsers(token)
      setUsers(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || '회원 목록을 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRoleChange = async (userId, nextRole) => {
    if (!canManageRoles) return
    setBusyUserId(userId)
    setError('')
    setNotice('')
    try {
      const updated = await updateUserRole(userId, nextRole, token)
      setUsers((prev) => prev.map((user) => (user.id === userId ? updated : user)))
      setNotice('회원 권한을 변경했습니다.')
      onToast?.('회원 권한을 변경했습니다.')
    } catch (err) {
      const message = err.message || '권한 변경 중 문제가 발생했습니다.'
      setError(message)
      onToast?.(message, 'error')
    } finally {
      setBusyUserId(null)
    }
  }

  const formatDate = (value) => {
    if (!value) return '기록 없음'
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

  return (
    <section className="admin-panel">
      <div className="admin-panel__header">
        <div>
          <h2>관리자 대시보드</h2>
          <p className="admin-panel__subtitle">푸른 계열의 가벼운 느낌으로 구성된 회원 관리 페이지입니다.</p>
        </div>
        <button type="button" className="admin-refresh" onClick={loadUsers} disabled={isLoading}>
          {isLoading ? '불러오는 중...' : '새로고침'}
        </button>
      </div>

      {!canManageRoles && (
        <p className="admin-panel__readonly">
          현재 계정은 조회 전용 권한입니다. (역할: {ROLE_LABELS[profile?.role] || '알 수 없음'})
        </p>
      )}

      {error && <p className="admin-panel__error">{error}</p>}
      {notice && <p className="admin-panel__notice">{notice}</p>}

      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>이메일</th>
              <th>회원 유형</th>
              <th>최근 로그인</th>
              <th>연결된 로그인</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isPrimaryAdmin = (user.email || '').toLowerCase() === primaryAdminEmail.toLowerCase()
              return (
                <tr key={user.id} className={isPrimaryAdmin ? 'admin-table__primary' : ''}>
                  <td>
                    <div className="admin-user">
                      <span className="admin-user__name">{user.name || '이름 없음'}</span>
                      <span className="admin-user__id">ID: {user.id}</span>
                    </div>
                  </td>
                  <td>{user.email}</td>
                  <td>
                    {canManageRoles && !isPrimaryAdmin ? (
                      <select
                        value={user.role ?? 'member'}
                        onChange={(event) => handleRoleChange(user.id, event.target.value)}
                        disabled={busyUserId === user.id}
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`role-badge role-${user.role ?? 'member'}`}>{ROLE_LABELS[user.role] || '일반회원'}</span>
                    )}
                  </td>
                  <td>{formatDate(user.last_login_at)}</td>
                  <td>
                    <div className="provider-chips">
                      {(user.providers || ['local']).map((provider) => (
                        <span key={provider} className={`provider-chip provider-${provider}`}>
                          {provider}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              )
            })}
            {!users.length && (
              <tr>
                <td colSpan={5} className="admin-table__empty">
                  아직 등록된 회원이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
