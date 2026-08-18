from django.urls import path
from auth_app import views

urlpatterns = [
    path("register", views.register),
    path("login", views.login),
    path("logout", views.logout),
    path("me", views.get_me_view),
    path("users", views.list_users),
    path("users/create", views.admin_create_user),
    path("users/<int:user_id>", views.update_user),
    path("users/<int:user_id>/delete", views.delete_user),
]
