# IoT Guard Platform - Production Dockerfile

FROM python:3.11-slim

# Python settings
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Application directory
WORKDIR /app

# System dependencies required by PostgreSQL/Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy Django project
COPY . /app/

# Collect static files during image build
RUN python manage.py collectstatic --noinput

# Render provides PORT at runtime
EXPOSE 8000

# Run migrations and then start Gunicorn
CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn iot_monitoring.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers 1 --threads 2 --timeout 120"]