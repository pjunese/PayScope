import AdminExpensePanel from '../components/AdminExpensePanel'

export default function AdminExpensesPage({ token, isAdmin, onToast }) {
  if (!token || !isAdmin) {
    return <p className="error">관리자만 접근할 수 있습니다.</p>
  }
  return <AdminExpensePanel token={token} onToast={onToast} />
}
