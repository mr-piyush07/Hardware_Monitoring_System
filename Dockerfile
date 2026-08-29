# Dockerfile for IoT Guard Platform
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# Copy application files
COPY . /app/

# Collect static files
RUN python manage.py collectstatic --noinput

# Render will provide PORT
EXPOSE 8000

# One worker for Render Free (512 MB RAM)
CMD ["sh", "-c", "gunicorn iot_monitoring.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers 1 --threads 2 --timeout 120"]