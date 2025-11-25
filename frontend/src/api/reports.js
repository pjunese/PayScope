const API_BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

export async function fetchDailyReport({ start, end, token }) {
  const params = new URLSearchParams()
  if (start) params.append('start', start)
  if (end) params.append('end', end)
  const response = await fetch(`${API_BASE}/api/expenses/reports/daily/?${params.toString()}`, {
    headers: {
      Authorization: `Token ${token}`,
    },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload?.detail || '리포트를 불러오지 못했습니다.')
  }
  return response.json()
}

export async function fetchCategoryReport({ start, end, token }) {
  const params = new URLSearchParams()
  if (start) params.append('start', start)
  if (end) params.append('end', end)
  const response = await fetch(`${API_BASE}/api/expenses/reports/categories/?${params.toString()}`, {
    headers: {
      Authorization: `Token ${token}`,
    },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload?.detail || '카테고리 리포트를 불러오지 못했습니다.')
  }
  return response.json()
}
