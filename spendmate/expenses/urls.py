from django.urls import path

from .views import (
    DailyExpenseReportView,
    ExpenseConfirmView,
    ExpenseUploadView,
    CategoryExpenseReportView,
    LatestExpenseView,
    AdminExpenseListView,
    ExpenseGoalView,
    ExpenseCalendarView,
)

urlpatterns = [
    path("upload/", ExpenseUploadView.as_view(), name="expense-upload"),
    path("confirm/", ExpenseConfirmView.as_view(), name="expense-confirm"),
    path("reports/daily/", DailyExpenseReportView.as_view(), name="expense-report-daily"),
    path("reports/categories/", CategoryExpenseReportView.as_view(), name="expense-report-categories"),
    path("latest/", LatestExpenseView.as_view(), name="expense-latest"),
    path("admin/list/", AdminExpenseListView.as_view(), name="expense-admin-list"),
    path("goals/", ExpenseGoalView.as_view(), name="expense-goals"),
    path("calendar/", ExpenseCalendarView.as_view(), name="expense-calendar"),
]
