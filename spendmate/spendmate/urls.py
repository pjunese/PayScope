"""
URL configuration for spendmate project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
"""
MTV 패턴 
모델 -> Django와 DB를 연결시켜주는 코드이며 데이터의 형태를 나타냄 
Template -> 웹 브라우저로 돌려줄 코드이며, 사용자에게 제공될 결과물의 형태를 나타냄
HTML 을 사용
View -> 사용자의 요청을 받아 처리하는 웹 사이트의 로직을 가짐 
MVC패턴과 동일한데 이때의 View 가 여기서는 Template, controller 가 여기서 view

"""
# URLconf(메뉴판) 구현 
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health_view(_request):
    return JsonResponse({"status": "ok"})

urlpatterns = [
    path('admin/', admin.site.urls),
    path('health/', health_view, name='health'),
    path('api/auth/', include('accounts.urls')),
    path('api/expenses/', include('expenses.urls')),
]
