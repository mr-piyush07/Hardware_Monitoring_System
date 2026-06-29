# IoT Guard - Professional Hardware Monitoring System

A high-performance, modular IoT monitoring platform built with FastAPI and Vanilla JS. Designed for real-time telemetry ingestion, advanced data visualization, and automated alerting.

## 🚀 Key Features
- **Hybrid Ingestion**: Supports both **HTTP POST** and **MQTT** for device telemetry.
- **Interactive Dashboard**: Real-time graphing using **Chart.js**, multi-sensor support, and live telemetry console.
- **Pro Alerting Engine**: Rule-based alerts with custom **SMTP Configuration** for instant email notifications.
- **Firmware Lab**: Auto-generate architecture-optimized C++ code for ESP32, ESP8266, and more.
- **Secure Architecture**: Hardware-specific secrets (HWID) and JWT-based user authentication.
- **Modular Monolith**: Clean codebase separation (`auth`, `devices`, `telemetry`, `alerts`).

## 🛠️ Technology Stack
- **Backend**: FastAPI (Python 3.9+), SQLAlchemy, Pydantic.
- **Frontend**: Glassmorphic UI (HTML5/CSS3), JavaScript (ES6+), Chart.js.
- **Database**: SQLite (Local Dev) / PostgreSQL (Production).

## 🏁 Getting Started

### 1. Backend Setup
Activate your virtual environment and start the server:
```powershell
# Windows (PowerShell)
.\venv\Scripts\activate; uvicorn app.main:app --host 0.0.0.0 --port 8001
```
*Backend will be available at: `http://localhost:8001`*

### 2. Frontend Setup
Open a new terminal and navigate to the `frontend` directory.
```powershell
# Start the Frontend Server
python -m http.server 8000
```
*Access the dashboard at: [http://localhost:8000](http://localhost:8000)*

## 📡 Hardware Integration
### HTTP Ingestion
Devices should send a POST request to:
`http://<SERVER_IP>:8001/telemetry/ingest`

**Headers:**
- `Content-Type: application/json`
- `x-hardware-id: <YOUR_HWID>`
- `x-device-secret: <YOUR_SECRET>`

**Payload Example:**
```json
{
  "data": {
    "temp_0": 24.5,
    "hum_0": 60,
    "voltage": 3.7
  }
}
```

## 📂 Project Structure
```text
├── app/
│   ├── modules/
│   │   ├── auth/         # JWT Auth & User Management
│   │   ├── devices/      # Hardware Registry & Meta
│   │   ├── telemetry/    # Data Ingestion & Storage
│   │   └── alerts/       # SMTP & Alert Trigger Logic
│   └── core/             # Global Config & DB Engine
├── frontend/
│   ├── index.html        # Main Dashboard UI
│   ├── app.js            # Frontend Logic & Charts
│   └── style.css         # Glassmorphic Design System
└── iot_data.db           # SQLite Database (Local)
```

## 🔔 Alert Triggers
1. Configure your SMTP in the **Notifications** tab.
2. Create an **Alert Rule** for a specific sensor key (e.g., `temp_0`).
3. If the incoming data matches your condition (e.g., `> 40`), an email is sent instantly.
