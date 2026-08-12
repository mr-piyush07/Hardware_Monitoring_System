from django.urls import path
from tickets_app import views

urlpatterns = [
    path("", views.ticket_list_create),
    path("<int:ticket_id>", views.ticket_detail_update),
]
