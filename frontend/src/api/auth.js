const API_BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

const defaultHeaders = {
  'Content-Type': 'application/json',
}

export async function login(payload) {
  const response = await fetch(`${API_BASE}/api/auth/login/`, {
    method: 'POST',
    headers: defaultHeaders,
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error?.detail || '로그인에 실패했습니다.')
  }
  return response.json()
}

export async function signup(payload) {
  const response = await fetch(`${API_BASE}/api/auth/signup/`, {
    method: 'POST',
    headers: defaultHeaders,
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    const fallback =
      typeof error === 'object' && error
        ? Object.values(error).flat?.()?.[0] ||
          Object.values(error)[0]?.[0] ||
          JSON.stringify(error)
        : null
    throw new Error(error?.detail || fallback || '회원가입에 실패했습니다.')
  }
  return response.json()
}

export async function fetchProviders() {
  const response = await fetch(`${API_BASE}/api/auth/providers/`)
  if (!response.ok) return {}
  return response.json()
}

export async function startOAuth(provider) {
  const response = await fetch(`${API_BASE}/api/auth/oauth/${provider}/start/`, {
    method: 'GET',
    credentials: 'include',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error?.detail || '간편 로그인 준비에 실패했습니다.')
  }
  return response.json()
}

export async function fetchOAuthStatus(state) {
  const response = await fetch(`${API_BASE}/api/auth/oauth/status/${state}/`, {
    method: 'GET',
    credentials: 'include',
  })
  if (response.status === 204) {
    return null
  }
  if (!response.ok) {
    throw new Error('간편 로그인 상태 확인에 실패했습니다.')
  }
  return response.json()
}

export async function fetchProfile(token) {
  const response = await fetch(`${API_BASE}/api/auth/me/`, {
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
    },
  })
  if (!response.ok) {
    throw new Error('프로필 정보를 불러오지 못했습니다.')
  }
  return response.json()
}

export async function fetchAdminUsers(token) {
  const response = await fetch(`${API_BASE}/api/auth/admin/users/`, {
    headers: {
      Authorization: `Token ${token}`,
    },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload?.detail || '회원 목록을 불러오지 못했습니다.')
  }
  return response.json()
}

export async function updateProfile(token, payload) {
  const response = await fetch(`${API_BASE}/api/auth/profile/`, {
    method: 'PATCH',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error?.detail || '프로필을 업데이트하지 못했습니다.')
  }
  return response.json()
}

export async function changePassword(token, payload) {
  const response = await fetch(`${API_BASE}/api/auth/password/`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error?.detail || '비밀번호를 변경하지 못했습니다.')
  }
  return response.json()
}

export async function checkNicknameAvailability(token, nickname) {
  const response = await fetch(
    `${API_BASE}/api/auth/nickname/check/?nickname=${encodeURIComponent(nickname)}`,
    {
      headers: {
        Authorization: `Token ${token}`,
      },
    }
  )
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error?.detail || '닉네임을 확인하지 못했습니다.')
  }
  return response.json()
}

export async function updateUserRole(userId, role, token) {
  const response = await fetch(`${API_BASE}/api/auth/admin/users/${userId}/role/`, {
    method: 'PATCH',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload?.detail || '역할 변경에 실패했습니다.')
  }
  return response.json()
}
