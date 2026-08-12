from django.urls import path
from telemetry_app import views

urlpatterns = [
    path("user/all", views.get_all_user_telemetry),
    path("ingest", views.ingest_telemetry),
    path("<str:hardware_id>", views.get_telemetry),
]
