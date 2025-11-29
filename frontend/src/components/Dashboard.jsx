import { useEffect, useMemo, useState } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { fetchCategoryReport, fetchDailyReport } from '../api/reports'
import { fetchGoalSummary, saveMonthlyGoal, fetchCalendarExpenses } from '../api/expenses'

const formatNumber = (value) =>
  new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(
    Math.round(value || 0)
  )

const formatLocalDate = (date) => {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  const local = new Date(date.getTime() - offsetMs)
  return local.toISOString().slice(0, 10)
}

const formatDisplayDate = (iso) => {
  if (!iso) return ''
  const [year, month, day] = iso.split('-')
  return `${year}.${month}.${day}`
}

const formatMonthLabel = (value) => {
  if (!value) return ''
  const [year, month] = value.split('-')
  return `${year}년 ${month}월`
}

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']
const VIEW_OPTIONS = [
  { value: 'daily', label: '일별' },
  { value: 'monthly', label: '월별' },
  { value: 'category', label: '카테고리' },
  { value: 'calendar', label: '캘린더' },
]

const DAILY_RANGE_DAYS = 7
const MONTHLY_RANGE_DAYS = 180
const CATEGORY_RANGE_MONTH = 1
const WEEK_TITLES = ['일', '월', '화', '수', '목', '금', '토']
const CATEGORY_COLORS = ['#2563eb', '#22c55e', '#f97316', '#a855f7', '#ef4444', '#14b8a6']
const GOAL_TIERS = [
  { min: 1.0, name: '인턴', english: 'Intern', emoji: '🪴', desc: '이번 달엔 목표를 초과했어요. 다음 달엔 조금만 더 아껴볼까요?' },
  { min: 0.9, name: '사원', english: 'Associate', emoji: '🧑‍💼', desc: '목표에 거의 근접했습니다. 이제 곧 안정적인 관리가 가능해요.' },
  { min: 0.8, name: '주임', english: 'Senior', emoji: '⭐️', desc: '알뜰한 습관이 자리잡고 있어요. 꾸준히 이어가 봅시다!' },
  { min: 0.7, name: '대리', english: 'Assistant Manager', emoji: '🥈', desc: '멋진 절약 능력입니다. 주위에 팁을 공유해 보세요.' },
  { min: 0.6, name: '과장', english: 'Manager', emoji: '🥇', desc: '탁월한 통제력! 목표 금액을 여유 자금으로 돌려 보는 건 어떨까요?' },
  { min: 0, name: '달인', english: 'Master', emoji: '💎', desc: '지출을 완벽히 통제하고 있어요. 재정의 달인이라 불러도 됩니다.' },
]

const monthKeyFromDate = (value) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`

function GoalChart({ labels, goals, actuals }) {
  if (!labels.length) return <p className="hint">표시할 데이터가 없습니다.</p>
  const chartData = labels.map((label, index) => ({
    label,
    goal: goals[index] ?? 0,
    actual: actuals[index] ?? 0,
  }))
  return (
    <div className="goal-chart">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 20, right: 20, bottom: 10, left: 10 }}>
          <defs>
            <linearGradient id="goalStroke" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a855f7" stopOpacity={1} />
              <stop offset="100%" stopColor="#a855f7" stopOpacity={0.4} />
            </linearGradient>
            <linearGradient id="actualStroke" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity={1} />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.4} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e1e9fb" strokeDasharray="3 3" opacity={0.8} />
          <XAxis dataKey="label" tickFormatter={(value) => `${value.slice(-2)}월`} tick={{ fill: '#4b5563', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`} tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            contentStyle={{
              background: '#ffffff',
              border: '1px solid #d4e5ff',
              borderRadius: 12,
              color: '#1f2933',
              boxShadow: '0 12px 30px rgba(15,23,42,0.08)',
            }}
            formatter={(value) => `${formatNumber(value)} 원`}
            labelFormatter={(value) => {
              const [year, month] = value.split('-')
              return `${year}년 ${month}월`
            }}
          />
          <Line type="monotone" dataKey="goal" stroke="url(#goalStroke)" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
          <Line type="monotone" dataKey="actual" stroke="url(#actualStroke)" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
      <div className="goal-chart__legend">
        <span>
          <span className="legend-dot goal" />목표
        </span>
        <span>
          <span className="legend-dot actual" />실제
        </span>
      </div>
    </div>
  )
}

export default function Dashboard({ token, profile }) {
  const [dailyReport, setDailyReport] = useState(null)
  const [monthlyReport, setMonthlyReport] = useState(null)
  const [categoryReport, setCategoryReport] = useState(null)
  const [dailyRange, setDailyRange] = useState(null)
  const [monthlyRange, setMonthlyRange] = useState(null)
  const [categoryRange, setCategoryRange] = useState(null)
  const [view, setView] = useState('daily')
  const [dailyOffset, setDailyOffset] = useState(0)
  const [isDailyLoading, setIsDailyLoading] = useState(false)
  const [isMonthlyLoading, setIsMonthlyLoading] = useState(false)
  const [isCategoryLoading, setIsCategoryLoading] = useState(false)
  const [dailyError, setDailyError] = useState('')
  const [categoryError, setCategoryError] = useState('')
  const [goalSummary, setGoalSummary] = useState(null)
  const [goalAmountInput, setGoalAmountInput] = useState('')
  const [goalMonthInput, setGoalMonthInput] = useState(monthKeyFromDate(new Date()))
  const [goalLoading, setGoalLoading] = useState(false)
  const [goalSaving, setGoalSaving] = useState(false)
  const [goalError, setGoalError] = useState('')
  const [calendarMonth, setCalendarMonth] = useState(() => monthKeyFromDate(new Date()))
  const [calendarData, setCalendarData] = useState(null)
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [calendarError, setCalendarError] = useState('')
  const [selectedDate, setSelectedDate] = useState(null)

  useEffect(() => {
    if (!token) return
    const end = new Date()
    const endDaily = new Date(end)
    endDaily.setDate(endDaily.getDate() - dailyOffset * 7)

    const fetchDaily = async () => {
      const today = new Date(endDaily)
      const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay()
      const monday = new Date(today)
      monday.setDate(today.getDate() - dayOfWeek + 1)
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      const startIso = formatLocalDate(monday)
      const endIso = formatLocalDate(sunday)
      setDailyRange({
        start: startIso,
        end: endIso,
        display: `${formatDisplayDate(startIso)} ~ ${formatDisplayDate(endIso)}`,
      })
      setIsDailyLoading(true)
      setDailyError('')
      try {
        const data = await fetchDailyReport({ start: startIso, end: endIso, token })
        setDailyReport(data)
      } catch (err) {
        setDailyError(err.message || '리포트를 불러오지 못했습니다.')
      } finally {
        setIsDailyLoading(false)
      }
    }

    const fetchMonthly = async () => {
      const start = new Date(end)
      start.setDate(end.getDate() - MONTHLY_RANGE_DAYS + 1)
      const startIso = formatLocalDate(start)
      const endIso = formatLocalDate(end)
      setMonthlyRange({
        start: startIso,
        end: endIso,
        display: `${formatDisplayDate(startIso)} ~ ${formatDisplayDate(endIso)}`,
      })
      setIsMonthlyLoading(true)
      try {
        const data = await fetchDailyReport({ start: startIso, end: endIso, token })
        setMonthlyReport(data)
      } catch {
        setMonthlyReport(null)
      } finally {
        setIsMonthlyLoading(false)
      }
    }

    const fetchCategory = async () => {
      const currentYear = end.getFullYear()
      const currentMonth = end.getMonth()
      const start = new Date(currentYear, currentMonth, 1)
      const endOfMonth = new Date(currentYear, currentMonth + CATEGORY_RANGE_MONTH, 0)
      const startIso = formatLocalDate(start)
      const endIso = formatLocalDate(endOfMonth)
      setCategoryRange({
        start: startIso,
        end: endIso,
        display: `${formatDisplayDate(startIso)} ~ ${formatDisplayDate(endIso)}`,
      })
      setIsCategoryLoading(true)
      setCategoryError('')
      try {
        const data = await fetchCategoryReport({ start: startIso, end: endIso, token })
        setCategoryReport(data)
      } catch (err) {
        setCategoryError(err.message || '카테고리 리포트를 불러오지 못했습니다.')
      } finally {
        setIsCategoryLoading(false)
      }
    }

    fetchDaily()
    fetchMonthly()
    fetchCategory()
  }, [token, dailyOffset])

  useEffect(() => {
    if (!token) return
    const loadGoals = async () => {
      setGoalLoading(true)
      setGoalError('')
      try {
        const data = await fetchGoalSummary(token, 6)
        setGoalSummary(data)
      } catch (err) {
        setGoalError(err.message || '목표 정보를 불러오지 못했습니다.')
      } finally {
        setGoalLoading(false)
      }
    }
    loadGoals()
  }, [token])

  useEffect(() => {
    if (!token || view !== 'calendar') return
    const loadCalendar = async () => {
      setCalendarLoading(true)
      setCalendarError('')
      try {
        const data = await fetchCalendarExpenses(token, calendarMonth)
        setCalendarData(data)
        const defaultDate =
          data?.days?.find((day) => (day.total || 0) > 0)?.date || data?.days?.[0]?.date || null
        setSelectedDate(defaultDate)
      } catch (err) {
        setCalendarError(err.message || '캘린더 데이터를 불러오지 못했습니다.')
      } finally {
        setCalendarLoading(false)
      }
    }
    loadCalendar()
  }, [token, calendarMonth, view])

  useEffect(() => {
    if (!goalSummary) return
    const goalValue = goalSummary.current?.goal
    const currentMonth =
      goalSummary.current?.month || (goalSummary.months ? goalSummary.months.at(-1) : null)
    setGoalAmountInput(goalValue ? String(Math.round(goalValue)) : '')
    setGoalMonthInput(currentMonth || monthKeyFromDate(new Date()))
  }, [goalSummary])

  const stats = useMemo(() => {
    if (!dailyReport) return { total: 0, average: 0, highest: 0 }
    const total = dailyReport.total_amount ?? 0
    const series = dailyReport.series?.[0]?.data || []
    const highest = series.reduce((acc, cur) => Math.max(acc, cur || 0), 0)
    const average = series.length ? total / series.length : 0
    return { total, average, highest }
  }, [dailyReport])

const dailySeries = useMemo(() => {
  if (!dailyReport || !dailyRange) return []
  const map = {}
  const labels = dailyReport.labels || []
  const values = dailyReport.series?.[0]?.data || []
  labels.forEach((label, idx) => {
    map[label] = (map[label] || 0) + (values[idx] || 0)
  })
  const start = new Date(dailyRange.start)
  const result = []
  for (let i = 0; i < WEEKDAY_LABELS.length; i += 1) {
    const cursor = new Date(start)
    cursor.setDate(start.getDate() + i)
    const iso = formatLocalDate(cursor)
    const weekdayIndex = cursor.getDay() === 0 ? 6 : cursor.getDay() - 1
    result.push({
      dayLabel: WEEKDAY_LABELS[weekdayIndex],
      dateLabel: formatDisplayDate(iso),
      value: Math.round(map[iso] || 0),
    })
  }
  return result
}, [dailyReport, dailyRange])

  const monthlyData = useMemo(() => {
    if (!monthlyReport) return { labels: [], values: [] }
    const buckets = {}
    const labels = monthlyReport.labels || []
    const values = monthlyReport.series?.[0]?.data || []
    labels.forEach((label, idx) => {
      const date = new Date(label)
      if (Number.isNaN(date.getTime())) return
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      buckets[key] = (buckets[key] || 0) + (values[idx] || 0)
    })
    const sortedKeys = Object.keys(buckets).sort()
    const limited = sortedKeys.slice(-6)
    return {
      labels: limited,
      values: limited.map((key) => Math.round(buckets[key] || 0)),
    }
  }, [monthlyReport])

  const categoryEntries = useMemo(() => categoryReport?.categories || [], [categoryReport])
  const categoryChartData = useMemo(() => {
    if (!categoryEntries.length) return []
    const total = categoryEntries.reduce((acc, entry) => acc + (entry.total || 0), 0)
    if (!total) return []
    return categoryEntries.slice(0, 8).map((entry) => ({
      label: entry.label,
      value: entry.total || 0,
      percentage: ((entry.total || 0) / total) * 100,
    }))
  }, [categoryEntries])

  const currentViewLabel = VIEW_OPTIONS.find((opt) => opt.value === view)?.label ?? ''
  const currentRange =
    view === 'daily' ? dailyRange : view === 'monthly' ? monthlyRange : categoryRange

  const dailyValues = useMemo(() => dailySeries.map((item) => item.value), [dailySeries])
  const [animatedWeekdayValues, setAnimatedWeekdayValues] = useState(dailyValues)
  const [animatedMonthlyValues, setAnimatedMonthlyValues] = useState(monthlyData.values)

  useEffect(() => {
    if (view !== 'daily') {
      setAnimatedWeekdayValues(dailyValues)
      return
    }
    setAnimatedWeekdayValues(Array(dailyValues.length).fill(0))
    const frame = requestAnimationFrame(() => {
      setAnimatedWeekdayValues(dailyValues)
    })
    return () => cancelAnimationFrame(frame)
  }, [dailyValues, view])

  useEffect(() => {
    if (view !== 'monthly') {
      setAnimatedMonthlyValues(monthlyData.values)
      return
    }
    setAnimatedMonthlyValues(Array(monthlyData.values.length).fill(0))
    const frame = requestAnimationFrame(() => {
      setAnimatedMonthlyValues(monthlyData.values)
    })
    return () => cancelAnimationFrame(frame)
  }, [monthlyData, view])

  const weekdayMax = Math.max(...dailyValues, 0)
  const monthlyMax = Math.max(...animatedMonthlyValues, 0)

  const renderTooltip = (value) =>
    value > 0 ? <div className="bar-tooltip">{formatNumber(value)}원</div> : null

  const currentLoading =
    view === 'daily'
      ? isDailyLoading
      : view === 'monthly'
        ? isMonthlyLoading
        : isCategoryLoading

  const handleGoalSave = async () => {
    if (!token) return
    if (!goalAmountInput) {
      setGoalError('목표 금액을 입력하세요.')
      return
    }
    const amount = Number(goalAmountInput)
    if (Number.isNaN(amount) || amount <= 0) {
      setGoalError('유효한 금액을 입력하세요.')
      return
    }
    if (!goalMonthInput) {
      setGoalError('목표 월을 선택하세요.')
      return
    }
    setGoalSaving(true)
    setGoalError('')
    try {
      const data = await saveMonthlyGoal({ token, amount, month: goalMonthInput })
      setGoalSummary(data)
    } catch (err) {
      setGoalError(err.message || '목표를 저장하지 못했습니다.')
    } finally {
      setGoalSaving(false)
    }
  }

  const goalProgress = goalSummary?.current?.goal
    ? (goalSummary.current.actual || 0) / goalSummary.current.goal
    : null
  const goalTier = useMemo(() => {
    if (goalProgress === null || goalProgress === undefined) return null
    const ratio = goalProgress ?? 0
    return GOAL_TIERS.find((tier) => ratio >= tier.min) || GOAL_TIERS[GOAL_TIERS.length - 1]
  }, [goalProgress])

  const handleCalendarShift = (delta) => {
    const [year, month] = calendarMonth.split('-').map(Number)
    const date = new Date(year, month - 1 + delta, 1)
    setCalendarMonth(monthKeyFromDate(date))
  }

  const calendarDays = useMemo(() => {
    if (!calendarData?.days) return []
    return calendarData.days
  }, [calendarData])

  const calendarWeeks = useMemo(() => {
    if (!calendarDays.length) return []
    const firstDate = new Date(calendarDays[0].date)
    const startOffset = firstDate.getDay()
    const daysWithPadding = []
    for (let i = 0; i < startOffset; i += 1) {
      daysWithPadding.push({ date: null })
    }
    daysWithPadding.push(...calendarDays)
    while (daysWithPadding.length % 7 !== 0) {
      daysWithPadding.push({ date: null })
    }
    const weeks = []
    for (let i = 0; i < daysWithPadding.length; i += 7) {
      weeks.push(daysWithPadding.slice(i, i + 7))
    }
    return weeks
  }, [calendarDays])

  const selectedEntries = useMemo(() => {
    if (!calendarData?.days || !selectedDate) return []
    return calendarData.days.find((day) => day.date === selectedDate)?.entries || []
  }, [calendarData, selectedDate])

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <div>
          <p className="nano muted">PayScope · Insights</p>
          <div className="dashboard__title-row">
            <h1>
              {profile?.nickname || profile?.name
                ? `${profile?.nickname || profile?.name}'s Spend Report`
                : 'Spend Report'}
            </h1>
            {goalTier && (
              <div
                className="goal-tier badge"
                onClick={() => setGoalModalOpen(true)}
                role="button"
                tabIndex={0}
              >
                <span className="goal-tier__emoji">{goalTier.emoji}</span>
                <span className="goal-tier__text">{goalTier.name}</span>
              </div>
            )}
          </div>
          {currentRange && <p className="nano muted">{`${currentRange.display} (KST)`}</p>}
        </div>
        <div className="dashboard__filters">
          {view === 'daily' && (
            <div className="week-controls">
              <button
                className="week-button"
                type="button"
                onClick={() => setDailyOffset((prev) => prev + 1)}
              >
                이전 주
              </button>
              <button
                className="week-button"
                type="button"
                onClick={() => setDailyOffset((prev) => Math.max(0, prev - 1))}
                disabled={dailyOffset === 0}
              >
                다음 주
              </button>
            </div>
          )}
          <div className="segmented">
            {VIEW_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={view === opt.value ? 'active' : ''}
                onClick={() => setView(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {!token && <p className="error">로그인 후 리포트를 확인하세요.</p>}
      {view !== 'calendar' && dailyError && <p className="error">{dailyError}</p>}

      {view === 'calendar' ? (
        <section className="calendar-panel">
          <div className="calendar-header">
            <div className="calendar-month">
              <button type="button" onClick={() => handleCalendarShift(-1)}>
                ←
              </button>
              <span>{calendarMonth.replace('-', '년 ')}월</span>
              <button type="button" onClick={() => handleCalendarShift(1)}>
                →
              </button>
            </div>
            {calendarData?.summary && (
              <div className="calendar-summary">
                <div>
                  <span className="nano muted">총 지출</span>
                  <strong>{formatNumber(calendarData.summary.total || 0)} 원</strong>
                </div>
                <div>
                  <span className="nano muted">일 평균</span>
                  <strong>{formatNumber(calendarData.summary.average || 0)} 원</strong>
                </div>
                <div>
                  <span className="nano muted">건수</span>
                  <strong>{calendarData.summary.count || 0}</strong>
                </div>
              </div>
            )}
          </div>
          {calendarError && <p className="error">{calendarError}</p>}
          {!calendarError && (
            <div className="calendar-grid">
              <div className="calendar-weekdays">
                {WEEK_TITLES.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              {calendarLoading ? (
                <p className="hint">캘린더를 불러오는 중...</p>
              ) : (
                <div className="calendar-weeks">
                  {calendarWeeks.map((week, idx) => (
                    <div key={`week-${idx}`} className="calendar-week-row">
                      {week.map((day, index) => {
                        if (!day.date) {
                          return <div key={`empty-${idx}-${index}`} className="calendar-day empty" />
                        }
                        const dayNum = Number(day.date.split('-')[2])
                        const isSelected = selectedDate === day.date
                          const hasValue = (day.total || 0) > 0
                          return (
                            <button
                              key={day.date}
                              type="button"
                              className={`calendar-day ${isSelected ? 'selected' : ''} ${
                                hasValue ? 'has-value' : ''
                              }`}
                              onClick={() => setSelectedDate(day.date)}
                            >
                              <span className="calendar-day__num">{dayNum}</span>
                              {hasValue && <span className="calendar-day__dot" />}
                              <span className="calendar-day__value">
                                {day.total ? `${formatNumber(day.total)}원` : '—'}
                              </span>
                            </button>
                          )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="calendar-details">
            <div className="calendar-details__header">
              <strong>{selectedDate ? selectedDate : '날짜 선택'}</strong>
              <span className="nano muted">{selectedEntries.length}건</span>
            </div>
            {selectedEntries.length ? (
              <ul className="calendar-entry-list">
                {selectedEntries.map((entry) => (
                  <li key={entry.id}>
                    <div>
                      <strong>{entry.merchant || '미입력'}</strong>
                      <span className="nano muted">{entry.category || '카테고리 없음'}</span>
                    </div>
                    <span>{formatNumber(entry.amount || 0)} 원</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">선택한 날짜의 지출이 없습니다.</p>
            )}
          </div>
        </section>
      ) : (
        <>
          <section className="goal-panel elevated">
            <div className="goal-panel__header">
            <div className="goal-info-row">
              <div className="goal-heading">
                <p className="nano muted">이번 달 목표 지출</p>
                <div className="goal-heading__value">
                  <strong>
                    {goalSummary?.current?.goal ? `${formatNumber(goalSummary.current.goal)} 원` : '미설정'}
                  </strong>
                  {goalProgress !== null && (
                    <span className="goal-heading__badge">{`${Math.round(goalProgress * 100)}% 사용`}</span>
                  )}
                </div>
              </div>
              <div className="goal-highlight">
                <div>
                  <span className="nano muted">실제 지출</span>
                    <strong>{formatNumber(goalSummary?.current?.actual || 0)} 원</strong>
                  </div>
                  <div>
                    <span className="nano muted">남은 금액</span>
                    <strong>
                      {goalSummary?.current?.goal
                        ? `${formatNumber(Math.max(0, goalSummary.current.goal - (goalSummary.current.actual || 0)))} 원`
                        : '미설정'}
                    </strong>
                  </div>
                </div>
              </div>
              <div className="goal-input-row">
                <select value={goalMonthInput} onChange={(event) => setGoalMonthInput(event.target.value)}>
                  {(goalSummary?.months || [goalMonthInput]).map((month) => (
                    <option key={month} value={month}>
                      {formatMonthLabel(month)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={goalAmountInput}
                  placeholder="목표 금액"
                  onChange={(event) => setGoalAmountInput(event.target.value)}
                />
                <button type="button" className="btn primary" onClick={handleGoalSave} disabled={goalSaving || !token}>
                  {goalSaving ? '저장 중...' : '목표 저장'}
                </button>
              </div>
            </div>
            {goalError && <p className="error">{goalError}</p>}
            <div className="goal-panel__body">
              {goalLoading && <p className="hint">목표 데이터를 불러오는 중...</p>}
              {!goalLoading && goalSummary && (
                <div className="goal-panel__content">
                  <GoalChart
                    labels={goalSummary.months || []}
                    goals={goalSummary.goals || []}
                    actuals={goalSummary.actuals || []}
                  />
                </div>
              )}
            </div>
          </section>

          <section className="card-grid">
            <div className="stat-card elevated">
              <p className="nano muted">총 지출</p>
              <strong>{formatNumber(stats.total)} 원</strong>
            </div>
            <div className="stat-card elevated">
              <p className="nano muted">일 평균</p>
              <strong>{formatNumber(stats.average)} 원</strong>
            </div>
            <div className="stat-card elevated">
              <p className="nano muted">최고 지출</p>
              <strong>{formatNumber(stats.highest)} 원</strong>
            </div>
          </section>

          <section className="panel elevated compact view-panel">
            <div className="panel-header">
              <span>{currentViewLabel} 지표</span>
              {currentLoading && <span className="nano muted">불러오는 중...</span>}
            </div>
            {view === 'daily' && (
              <div className="split-panel">
                <div className="split-panel__main">
                  {dailySeries.some((item) => item.value > 0) ? (
                    <div className="chart simple-bars compact-bars">
                      {dailySeries.map((item, idx) => (
                        <div key={`${item.dayLabel}-${item.dateLabel}`} className="bar small">
                          {renderTooltip(animatedWeekdayValues[idx])}
                          <div
                            className="bar__fill"
                            style={{
                              height: `${
                                weekdayMax ? Math.min(100, (animatedWeekdayValues[idx] / weekdayMax) * 100) : 0
                              }%`,
                            }}
                          />
                          <span className="bar__label nano">{item.dayLabel}</span>
                          <span className="bar__sublabel nano">{item.dateLabel}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="hint">표시할 데이터가 없습니다.</p>
                  )}
                </div>
                <div className="split-panel__aside placeholder">
                  <span>추가 지표 영역</span>
                </div>
              </div>
            )}

            {view === 'monthly' && (
              <div className="split-panel">
                <div className="split-panel__main">
                  {monthlyData.values.length ? (
                    <div className="chart simple-bars compact-bars">
                      {monthlyData.values.map((value, idx) => (
                        <div key={monthlyData.labels[idx] || idx} className="bar small">
                          {renderTooltip(value)}
                          <div
                            className="bar__fill"
                            style={{
                              height: `${
                                monthlyMax ? Math.min(100, (animatedMonthlyValues[idx] / monthlyMax) * 100) : 0
                              }%`,
                            }}
                          />
                          <span className="bar__label nano">{monthlyData.labels[idx]}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="hint">표시할 데이터가 없습니다.</p>
                  )}
                </div>
                <div className="split-panel__aside placeholder">
                  <span>추가 지표 영역</span>
                </div>
              </div>
            )}

            {view === 'category' && (
              <div className="category-chart">
                {categoryError && <p className="error">{categoryError}</p>}
                {!categoryError && categoryChartData.length ? (
                  <>
                    <ResponsiveContainer width="60%" height={220}>
                      <PieChart>
                        <Pie
                          data={categoryChartData}
                          dataKey="value"
                          nameKey="label"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={2}
                        >
                          {categoryChartData.map((entry, idx) => (
                            <Cell key={`slice-${entry.label}`} fill={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value, name, props) => [`${formatNumber(value)} 원`, props?.payload?.label || name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="category-legend">
                      {categoryChartData.map((slice, idx) => (
                        <div key={slice.label} className="category-legend__item">
                          <span>
                            <span className={`legend-dot legend-${idx}`} />
                            {slice.label}
                          </span>
                          <span>{slice.percentage.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  !isCategoryLoading && <p className="hint">표시할 데이터가 없습니다.</p>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
