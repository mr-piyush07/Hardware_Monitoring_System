from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("auth_app", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="permissions",
            field=models.TextField(default="[]"),
        ),
    ]
