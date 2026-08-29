#!/usr/bin/env bash
# Exit immediately if a command exits with a non-zero status
set -o errexit

echo "==> Python version..."
python --version

echo "==> Installing Dependencies..."
pip install -r requirements.txt

echo "==> Verifying DATABASE_URL is set..."
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL is not set! PostgreSQL connection will fail."
  exit 1
else
  echo "✅ DATABASE_URL is configured."
fi

echo "==> Collecting Static Files..."
python manage.py collectstatic --noinput

echo "==> Applying Database Migrations..."
python manage.py migrate --run-syncdb

echo "==> Build Completed Successfully! 🚀"
