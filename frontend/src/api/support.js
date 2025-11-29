const API_BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

export async function submitSupportRequest(token, payload) {
  const response = await fetch(`${API_BASE}/api/support/requests/`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data?.detail || '요청 사항을 전송하지 못했습니다.')
  }
  return response.json()
}

export async function submitQuestion(token, payload) {
  const response = await fetch(`${API_BASE}/api/support/questions/`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data?.detail || '문의 내용을 등록하지 못했습니다.')
  }
  return response.json()
}
