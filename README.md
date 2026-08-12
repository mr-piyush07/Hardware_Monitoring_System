# IoT Guard - Professional Hardware Monitoring System (Django Edition)

A high-performance, modular IoT monitoring platform built with **Django & Django REST Framework (DRF)**. The frontend (HTML/CSS/JS) is served directly by Django from `templates/` and `static/` — no separate frontend server needed.

---

## 🚀 Key Features

- **Django Architecture**: Clean modular apps (`auth_app`, `devices_app`, `telemetry_app`, `alerts_app`, `tickets_app`).
- **Integrated Frontend**: UI served via Django templates (no separate server needed).
- **Multi-Database Ready**:
  - **SQLite** (default) — runs out of the box with existing `iot_data.db`.
  - **PostgreSQL** — switch via `DB_ENGINE=postgresql` environment variable.
  - **MongoDB** — pluggable `TelemetryRepository` pattern, switch via `DB_ENGINE=mongodb`.
- **Django Admin** — manage Users, Devices, Alerts, Tickets at `/admin/`.
- **JWT Auth** — bcrypt password hashing, Redis session tracking (falls back to in-memory if Redis is unavailable).
- **Background Worker** — offline device heartbeat detection + MQTT listener.
- **Alert Engine** — rule-based triggers with SMTP email notifications.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| Backend Framework | Django 5.0, Django REST Framework |
| Authentication | JWT (`python-jose`), bcrypt |
| Session Store | Redis (in-memory FakeRedis fallback) |
| Database | SQLite (default) / PostgreSQL / MongoDB |
| IoT Ingestion | HTTP POST + MQTT (`aiomqtt`) |
| Frontend | Vanilla HTML5 / CSS3 / JavaScript (Chart.js) |

---

## 📂 Project Structure

```text
hardware_monitoring system/
├── manage.py                 ← Django management entry point
├── iot_monitoring/           ← Project config package
│   ├── settings.py           ← All configuration (DB, Redis, JWT, MQTT)
│   ├── urls.py               ← Root URL routing
│   └── wsgi.py
├── core/                     ← Security, JWT, Redis session helpers, Authentication
│   ├── security.py           ← bcrypt + PyJWT utilities
│   ├── redis_client.py       ← Redis / FakeRedis session store
│   └── authentication.py    ← JWTAuthentication + RoleChecker for DRF
├── auth_app/                 ← User registration, login, logout, admin user management
├── devices_app/              ← Device CRUD, hardware secrets, last_seen tracking
├── telemetry_app/            ← Telemetry ingestion (HTTP + MQTT), history, repository layer
│   └── repository.py         ← Pluggable: DjangoORMRepository | MongoDBRepository
├── alerts_app/               ← SMTP configs, alert rules, email alerts, alert logs, support tickets
├── tickets_app/              ← Standalone support ticket CRUD
├── templates/
│   └── index.html            ← Main Dashboard UI (served by Django)
├── static/
│   ├── app.js                ← Frontend logic & Chart.js graphs
│   └── style.css             ← Glassmorphic design system
├── background_worker.py      ← Async heartbeat monitor + MQTT consumer
├── iot_data.db               ← SQLite database (auto-used)
└── requirements.txt
```

---

## 🏁 Quick Start

### 1. Install Dependencies
```powershell
pip install -r requirements.txt
```

### 2. Run Database Migrations
```powershell
python manage.py migrate
```

### 3. Start the Server
```powershell
python manage.py runserver 8000
```

Open your browser at **[http://localhost:8000](http://localhost:8000)** — the full dashboard UI loads directly from Django.

### 4. (Optional) Start Background Worker
In a separate terminal for heartbeat monitoring & MQTT ingestion:
```powershell
python background_worker.py
```

### 5. (Optional) Create Django Admin Superuser
```powershell
python manage.py createsuperuser
```
Then visit **[http://localhost:8000/admin/](http://localhost:8000/admin/)**.

---

## 🗄️ Database Configuration

### Switch to PostgreSQL
```powershell
$env:DB_ENGINE="postgresql"
$env:POSTGRES_DB="iot_monitoring"
$env:POSTGRES_USER="postgres"
$env:POSTGRES_PASSWORD="yourpassword"
$env:POSTGRES_HOST="localhost"
python manage.py migrate
python manage.py runserver 8000
```

### Switch Telemetry to MongoDB
```powershell
$env:DB_ENGINE="mongodb"
$env:MONGO_URI="mongodb://localhost:27017/"
$env:MONGO_DB_NAME="iot_monitoring"
python manage.py runserver 8000
```

> All authentication, devices, alerts — still use Django ORM (SQLite/PostgreSQL).
> Only high-volume telemetry records route to MongoDB.

---

## 📡 Hardware Integration (HTTP Ingest)

Send a POST request from your ESP32/ESP8266/LoRa device:

```
POST http://<SERVER_IP>:8000/telemetry/ingest
Headers:
  Content-Type: application/json
  x-hardware-id: <YOUR_HWID>
  x-device-secret: <YOUR_SECRET>

Body:
{
  "temp": 24.5,
  "hum": 60,
  "voltage": 3.7
}
```

---

## 🔑 API Endpoints Summary

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login (returns JWT token) |
| POST | `/auth/logout` | Logout (invalidates session) |
| GET | `/auth/users` | List all users (admin only) |
| DELETE | `/auth/users/<id>` | Delete user (admin only) |
| GET/POST | `/devices/` | List / register device |
| DELETE | `/devices/<id>` | Delete device |
| GET | `/telemetry/<hardware_id>` | Get device telemetry history |
| GET | `/telemetry/user/all` | Get all telemetry for current user |
| POST | `/telemetry/ingest` | Ingest telemetry from hardware |
| GET/POST | `/alerts/smtp` | Manage SMTP relay configs |
| POST | `/alerts/smtp/test` | Test SMTP connection |
| GET/POST | `/alerts/rules` | Manage alert rules |
| GET | `/alerts/logs/<device_id>` | Get alert logs for device |
| POST | `/alerts/logs/<log_id>/resolve` | Resolve an alert |
| GET/POST | `/tickets/` | Support ticket CRUD |
