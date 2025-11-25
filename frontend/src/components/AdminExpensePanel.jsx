import { useEffect, useState } from 'react'
import { fetchAdminExpenses, deleteAdminExpense } from '../api/expenses'

export default function AdminExpensePanel({ token, onToast }) {
  const [records, setRecords] = useState([])
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)

  useEffect(() => {
    if (!token) return
    load()
  }, [token])

  const load = async () => {
    if (!token) return
    setIsLoading(true)
    setError('')
    try {
      const data = await fetchAdminExpenses(token)
      setRecords(Array.isArray(data) ? data : [])
    } catch (loadError) {
      setError(loadError.message || '기록을 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  const performDelete = async (documentId) => {
    if (!documentId || !token) return
    setBusyId(documentId)
    setError('')
    try {
      await deleteAdminExpense(documentId, token)
      setRecords((prev) => prev.filter((item) => item.id !== documentId))
      onToast?.('기록을 삭제했습니다.')
    } catch (err) {
      const message = err.message || '삭제에 실패했습니다.'
      setError(message)
      onToast?.(message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleDeleteConfirm = () => {
    if (!pendingDelete) return
    performDelete(pendingDelete.id)
    setPendingDelete(null)
  }

  return (
    <section className="admin-panel">
      <div className="admin-panel__header">
        <div>
          <h2>추출 기록</h2>
          <p className="admin-panel__subtitle">OCR 원본과 사용자가 저장한 결과를 확인하고 관리할 수 있습니다.</p>
        </div>
        <button type="button" className="admin-refresh" onClick={load} disabled={isLoading}>
          {isLoading ? '불러오는 중...' : '새로고침'}
        </button>
      </div>
      {error && <p className="admin-panel__error">{error}</p>}
      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>#</th>
              <th>사용자</th>
              <th>상태</th>
              <th>엔진</th>
              <th>저장일</th>
              <th>원본 텍스트</th>
              <th>저장된 정보</th>
              <th>액션</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td>{record.index}</td>
                <td>
                  <div className="admin-user">
                    <span className="admin-user__name">{record.user_id || '알 수 없음'}</span>
                    <span className="admin-user__id">ID: {record.id}</span>
                  </div>
                </td>
                <td>{record.status}</td>
                <td>{record.ocr_engine || record.ocr?.debug?.engine || '알 수 없음'}</td>
                <td>{record.confirmed_at || record.created_at || '기록 없음'}</td>
                <td>
                  <details>
                    <summary>보기</summary>
                    <pre>{record.ocr?.raw_text || '원본 없음'}</pre>
                  </details>
                </td>
                <td>
                  <ul className="selection-list">
                    <li>
                      <strong>가맹점</strong> {record.selection?.merchant || '미입력'}
                    </li>
                    <li>
                      <strong>금액</strong> {record.selection?.amount_text || '미입력'}
                    </li>
                    <li>
                      <strong>날짜</strong> {record.selection?.date_text || '미입력'}
                    </li>
                    <li>
                      <strong>카테고리</strong> {record.selection?.category || '미입력'}
                    </li>
                    <li>
                      <strong>수량</strong> {record.selection?.quantity || '미입력'}
                    </li>
                    <li>
                      <strong>분담 방식</strong> {record.selection?.split_mode === 'custom' ? '직접 입력' : 'N분의 1'}
                    </li>
                    {record.selection?.split_mode === 'equal' ? (
                      <li>
                        <strong>인원수</strong> {record.selection?.participant_count || 1}
                      </li>
                    ) : (
                      <li>
                        <strong>내 부담금</strong> {record.selection?.custom_share || '미입력'}
                      </li>
                    )}
                  </ul>
                </td>
                <td>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setPendingDelete(record)}
                    disabled={busyId === record.id}
                  >
                    {busyId === record.id ? '삭제 중...' : '삭제'}
                  </button>
                </td>
              </tr>
            ))}
            {!records.length && (
              <tr>
                <td colSpan={8} className="admin-table__empty">
                  표시할 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pendingDelete && (
        <div className="modal-backdrop">
          <div className="confirm-modal">
            <h4>선택한 기록을 삭제할까요?</h4>
            <div className="confirm-actions">
              <button type="button" className="btn ghost" onClick={() => setPendingDelete(null)}>
                취소
              </button>
              <button type="button" className="btn primary" onClick={handleDeleteConfirm}>
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
