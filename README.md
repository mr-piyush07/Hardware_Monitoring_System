# 🛡️ IoT Guard — Enterprise Hardware Telemetry & Sentinel Monitoring System

A high-performance, enterprise-grade IoT hardware monitoring and telemetry platform built with **Django**, **Async MQTT**, **REST Telemetry APIs**, **Render Managed PostgreSQL**, and **Chart.js**. Designed for real-time fleet analytics, trigger rule evaluation, support ticketing, multi-node LoRa gateways, and automated firmware generation.

---

## 🚀 Render Deployment Ready

This repository is **100% Render-ready** for production deployment:
- ✅ **Automatic Database URL Parsing**: Integrated `dj-database-url` to connect Django directly to Render Managed PostgreSQL via `DATABASE_URL`.
- ✅ **WhiteNoise Static File Serving**: Configured `whitenoise.middleware.WhiteNoiseMiddleware` with `CompressedManifestStaticFilesStorage`.
- ✅ **Automated Build Script**: Includes `./build.sh` (`pip install`, `collectstatic`, `migrate`).
- ✅ **1-Click Render Blueprint**: Includes `render.yaml` for automatic Web Service + PostgreSQL database setup.

---

## 🌟 Key Features

- ⚡ **Multi-Protocol Telemetry Ingestion**:
  - **HTTP POST API**: Dedicated `/telemetry/ingest` endpoint with device hardware authentication (`x-hardware-id`, `x-device-secret`).
  - **Async MQTT Ingestion**: Real-time telemetry ingestion worker built with `aiomqtt`.
  - **Multi-Node LoRa Routing**: LoRa gateway authentication with dynamic sub-node routing (`node_id` payload mapping).
- 📊 **Real-Time Overview & Fleet Analytics**:
  - Dynamic **Chart.js** donut ring charts powered directly by real database telemetry.
  - Active node health tracking (`Reporting` <10min, `Warning` 10-30min, `Silent` >30min).
  - Auto-refreshing ticker with instant manual refresh controls.
- 🛠️ **Interactive Firmware Lab & C++ Code Builder**:
  - 14 supported hardware modules & sensors (**ESP32**, **SX1276 LoRa**, **BME280**, **BH1750**, **PMS5003**, **Rain Sensor**, **Soil Moisture**, **NEO-6M GPS**, **OLED SSD1306**, **Relay Module**, **Buzzer**, **Status LEDs**, **DS3231 RTC**, **Battery Monitor INA219**).
  - Dynamic GPIO pin auto-suggestion and customization.
  - Generates ready-to-flash C++/Arduino code (`main_firmware.ino`).
- 🗄️ **Multi-Database Abstraction**:
  - Modular Repository pattern abstraction in `telemetry_app/repository.py`.
  - Local Dev: Default **SQLite** (`iot_data.db`) or local PostgreSQL.
  - Production: **Render Managed PostgreSQL** (`DATABASE_URL`).

---

## 🚢 Render Deployment Instructions

### Method 1: Using Render Blueprints (`render.yaml`) — 1-Click Setup

1. Push this repository to **GitHub**.
2. Go to [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprints**.
3. Connect your GitHub repository.
4. Render will automatically detect `render.yaml`, create your **Managed PostgreSQL Database**, deploy the **Django Web Service**, set secret keys, and run migrations via `./build.sh`.

---

### Method 2: Manual Step-by-Step Render Setup

#### 1. Create PostgreSQL Database on Render
- Render Dashboard → **New** → **PostgreSQL**.
- Name: `iot-monitoring-db`
- Copy the **Internal Database URL** (e.g. `postgresql://iot_user:password@dpg-xxx/iot_monitoring_db`).

#### 2. Create Web Service on Render
- Render Dashboard → **New** → **Web Service** → Connect your GitHub repo.
- **Build Command**: `./build.sh` (or `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate`)
- **Start Command**: `gunicorn iot_monitoring.wsgi:application`

#### 3. Add Environment Variables in Render Web Service
Go to Environment tab and add:
```ini
DEBUG=False
SECRET_KEY=your-custom-production-secret-key
JWT_SECRET_KEY=your-custom-jwt-secret-key
DATABASE_URL=postgresql://iot_user:password@dpg-xxx/iot_monitoring_db
```
*(Note: `RENDER_EXTERNAL_HOSTNAME` is automatically provided by Render and appended to `ALLOWED_HOSTS`).*

#### 4. Create Django Superuser (Admin Account)
After deployment completes, open your Web Service **Shell** in Render:
```bash
python manage.py createsuperuser
```
Access Django Admin at `https://your-app.onrender.com/admin/`.

---

## 💻 Local Setup & Development

```bash
# 1. Clone repository & enter directory
git clone <your-repo-url>
cd "hardware_monitoring system"

# 2. Install dependencies
pip install -r requirements.txt

# 3. Apply local SQLite migrations
python manage.py migrate

# 4. Start development server
python manage.py runserver 8000
```
Open **`http://localhost:8000`** in your browser.

---

## 📁 Project Directory Structure

```
hardware_monitoring system/
├── iot_monitoring/           # Main Django Project Settings & Routing
│   ├── settings.py           # Configured for Render, WhiteNoise, dj-database-url
│   ├── urls.py               # Main URL Routing
│   ├── wsgi.py               # WSGI Entry Point for Gunicorn
│   └── asgi.py               # ASGI Entry Point for Uvicorn
├── core/                     # JWT Authentication & Core Utilities
├── auth_app/                 # User Authentication & Role Control (Admin/User)
├── devices_app/              # Device Management & Registration
├── telemetry_app/            # Telemetry Ingestion & Database Repository Pattern
├── alerts_app/               # Alert Trigger Engine & Email Rules
├── tickets_app/              # Incident Tickets & Incident Queue
├── static/                   # Static Frontend Assets (CSS, JS)
├── templates/                # Frontend HTML Templates (SPA UI)
├── background_worker.py      # Async MQTT Telemetry Background Worker
├── build.sh                  # Render Build Script
├── render.yaml               # Render Blueprint Definition
├── requirements.txt          # Production Dependencies
├── .env.example              # Environment Variable Template
├── Dockerfile                # Production Docker Definition
└── docker-compose.yml        # Docker Multi-Container Compose
```

---

## 🌐 Telemetry API Endpoint

### Ingest Telemetry Data (HTTP POST)
**Endpoint**: `POST /telemetry/ingest`  
**Headers**:
```http
Content-Type: application/json
x-hardware-id: ESP32_SENSOR_01
x-device-secret: YOUR_DEVICE_SECRET_KEY
```
**JSON Payload**:
```json
{
  "data": {
    "temperature": 26.5,
    "humidity": 55.0,
    "pressure": 1013.25
  }
}
```
