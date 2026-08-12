from django.db import models

class User(models.Model):
    email = models.EmailField(unique=True, db_index=True)
    hashed_password = models.CharField(max_length=255)
    full_name = models.CharField(max_length=255, null=True, blank=True)
    role = models.CharField(max_length=50, default="user") # admin, subadmin, user
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "users"

    @property
    def is_authenticated(self):
        return True

    def __str__(self):
        return self.email
