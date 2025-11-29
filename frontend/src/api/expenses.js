const API_BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

export async function fetchLatestExpense(token) {
  const response = await fetch(`${API_BASE}/api/expenses/latest/`, {
    headers: {
      Authorization: `Token ${token}`,
    },
  })
  if (response.status === 204) {
    return null
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload?.detail || '최근 저장본을 불러오지 못했습니다.')
  }
  return response.json()
}

export async function fetchAdminExpenses(token) {
  const response = await fetch(`${API_BASE}/api/expenses/admin/list/`, {
    headers: {
      Authorization: `Token ${token}`,
    },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload?.detail || '추출 기록을 불러오지 못했습니다.')
  }
  return response.json()
}

export async function deleteAdminExpense(id, token) {
  const response = await fetch(`${API_BASE}/api/expenses/admin/list/`, {
    method: 'DELETE',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload?.detail || '삭제에 실패했습니다.')
  }
  return true
}

export async function fetchGoalSummary(token, months = 6) {
  const response = await fetch(`${API_BASE}/api/expenses/goals/?months=${months}`, {
    headers: {
      Authorization: `Token ${token}`,
    },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload?.detail || '목표 정보를 불러오지 못했습니다.')
  }
  return response.json()
}

export async function saveMonthlyGoal({ token, amount, month }) {
  const response = await fetch(`${API_BASE}/api/expenses/goals/`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount, month }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload?.detail || '목표를 저장하지 못했습니다.')
  }
  return response.json()
}

export async function fetchCalendarExpenses(token, month) {
  const params = month ? `?month=${month}` : ''
  const response = await fetch(`${API_BASE}/api/expenses/calendar/${params}`, {
    headers: {
      Authorization: `Token ${token}`,
    },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload?.detail || '캘린더 데이터를 불러오지 못했습니다.')
  }
  return response.json()
}

export async function fetchUserActivity(token) {
  const response = await fetch(`${API_BASE}/api/expenses/activity/`, {
    headers: {
      Authorization: `Token ${token}`,
    },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload?.detail || '활동 정보를 불러오지 못했습니다.')
  }
  return response.json()
}
