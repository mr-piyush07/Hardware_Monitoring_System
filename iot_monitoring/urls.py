from django.contrib import admin
from django.urls import path, include
from django.shortcuts import render
from django.conf import settings
from django.conf.urls.static import static

def landing_page(request):
    return render(request, "landing.html")

def index_dashboard(request):
    return render(request, "index.html")

urlpatterns = [
    path("", landing_page, name="landing"),
    path("dashboard/", index_dashboard, name="dashboard"),
    path("admin/", admin.site.urls),
    path("auth/", include("auth_app.urls")),
    path("devices/", include("devices_app.urls")),
    path("telemetry/", include("telemetry_app.urls")),
    path("alerts/", include("alerts_app.urls")),
    path("tickets/", include("tickets_app.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATICFILES_DIRS[0])
