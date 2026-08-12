from django.urls import path
from devices_app import views

urlpatterns = [
    path("", views.device_list_create),
    path("<int:device_id>", views.device_delete),
]
