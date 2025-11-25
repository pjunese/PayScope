import AdminPanel from '../components/AdminPanel'

export default function AdminUsersPage({ token, profile, onToast }) {
  if (!token) {
    return <p className="error">관리자 페이지는 로그인 후 이용할 수 있습니다.</p>
  }
  return <AdminPanel token={token} profile={profile} onToast={onToast} />
}
