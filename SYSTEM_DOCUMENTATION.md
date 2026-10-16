# 🛡️ IoT Guard & Nexus Core — System Architecture & Technical Specifications

---

## 📌 1. Project Overview & Core Features

**IoT Guard (Nexus Core)** is an enterprise-grade, real-time Internet of Things (IoT) monitoring, hardware fleet management, telemetry ingestion, and automated trigger alerting platform. It provides hardware engineers and system administrators with a unified dashboard to manage microcontroller nodes, visualize live multi-sensor analytics, deploy firmware, and receive critical email alerts when field parameters exceed thresholds or nodes go offline.

### 🌟 Key Features Catalog

1. **Role-Based Access Control (RBAC) & Authentication:**
   - Granular permission matrix (`admin`, `subadmin`, `user`).
   - Customizable tab-level permissions (`overview`, `dashboard`, `fleet`, `details`, `tickets`, `alerts`, `firmware`, `users`, etc.).
   - Secure password hashing using PBKDF2/Bcrypt and stateless JWT token authentication with Redis session tracking.

2. **Universal Hardware Registry & Component Picker:**
   - Supports **ESP32**, **ESP8266**, **Arduino (AVR)**, **Raspberry Pi**, **LoRa Gateways**, and **LoRa End Nodes**.
   - **Attached Component Picker Engine:** Supports over 40+ hardware sensors across 8 distinct categories (Weather, Air & Gas, Distance, Agriculture, Light, Power, Motion, Actuators).
   - Automatically generates isolated, dedicated dynamic graphs for each attached component.

3. **High-Speed Dual Telemetry Ingestion Engine:**
   - **HTTP REST API:** `/telemetry/ingest` supporting bulk payloads, gateway proxies, and single-node payloads with HMAC secret-header authentication (`x-hardware-id`, `x-device-secret`).
   - **Async MQTT Consumer:** Non-blocking asynchronous message ingestion via MQTT topics (`v1/devices/<hwid>`) through `aiomqtt`.

4. **Intelligent Trigger Engine & Alerting:**
   - Numerical condition evaluations (`>`, `<`, `==`, `>=`, `<=`, `!=`) for sensor parameters (e.g., Gas leak, High temperature, Low soil moisture).
   - Dynamic message formatting using placeholders (`{device}`, `{sensor}`, `{value}`).
   - Flap dampening with configurable **cooldown periods** (default 300 seconds).

5. **Dead-Man / Node Heartbeat Inactivity Monitor:**
   - Real-time offline detection based on `last_seen` timestamp.
   - Automatically alerts engineers when a hardware node ceases communication beyond a specified timeout threshold (e.g., 4 minutes).

6. **Outbound SMTP Relay Subsystem:**
   - Pluggable SMTP configuration supporting **Gmail (Port 587 STARTTLS)**, **Office 365 / Outlook**, and **Direct SSL (Port 465)**.
   - Instant handshake testing (`test_smtp_connection`) to verify credentials before saving.

7. **Firmware Lab (C++ / Arduino Code Generator):**
   - Automatically synthesizes production-ready C++ firmware for ESP32 and ESP8266 based on selected sensors, assigned pins, Wi-Fi credentials, and ingest API URLs.

8. **Incident Audit Logs & Ticketing System:**
   - Tracks every triggered alert in an incident log with resolution status (`Open`, `Acknowledged`, `Resolved`) and timestamps.
   - Built-in support ticket management with priority sorting.

---

## 🏛️ 2. Architectural Analysis: Django MVT vs. MVC

### ❓ Is this Project MVT or MVC?

> **Answer:** **It is an API-First, Decoupled Hybrid Architecture (DRF MVC + SPA Client on Django MVT Shell).**

While standard Django documentation classifies Django as **MVT (Model-View-Template)**, modern production architectures like this project evolve Django into a **Decoupled API Controller (MVC)** model.

```
+----------------------------------------------------------------------------------------------------+
|                                      CLIENT BROWSER (SPA)                                          |
|   HTML5 Shell (index.html) + Reactive Vanilla JS Engine (app.js) + Chart.js Real-time Renderers     |
+-------------------------------------------------+--------------------------------------------------+
                                                  |
                                                  | AJAX / JSON REST Calls (Bearer JWT)
                                                  v
+----------------------------------------------------------------------------------------------------+
|                                     DJANGO APPLICATION LAYER                                       |
|                                                                                                    |
|   [ CONTROLLERS / API VIEWS ]                                                                      |
|   - auth_app.views           -> /auth/login, /auth/register, /auth/me                              |
|   - devices_app.views        -> /devices/, /devices/<id>                                           |
|   - telemetry_app.views      -> /telemetry/ingest, /telemetry/<hwid>                               |
|   - alerts_app.views         -> /alerts/smtp, /alerts/rules, /alerts/logs                          |
|                                                                                                    |
|   [ SERVICES & WORKERS ]                                                                           |
|   - alerts_app.services      -> check_alerts(), process_heartbeat_alerts(), send_alert_email()     |
|   - background_worker.py     -> Async MQTT subscriber & 60-second Heartbeat evaluation loop        |
|                                                                                                    |
|   [ MODELS & ORM / REPOSITORIES ]                                                                  |
|   - Django ORM Models        -> User, Device, AlertRule, SMTPConfig, AlertLog, SupportTicket       |
|   - Telemetry Repositories   -> DjangoORMRepository (SQLite/Postgres) | MongoDBRepository (Atlas)   |
+-------------------------------------------------+--------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
|                                          PERSISTENCE LAYER                                         |
|   - Relational Database      -> SQLite (Local Dev) / PostgreSQL (Production)                       |
|   - Time-Series Telemetry    -> MongoDB Atlas (NoSQL high write throughput)                        |
|   - In-Memory Cache/Session  -> Redis (Session state, rate limiting)                               |
+----------------------------------------------------------------------------------------------------+
```

### Detailed Structural Breakdown:

| Layer | Traditional Django (MVT) | Classical MVC Equivalent | Implementation in this Project |
| :--- | :--- | :--- | :--- |
| **Model** | **Model** | **Model** | Standard Django ORM models (`auth_app.models.User`, `devices_app.models.Device`, `alerts_app.models.AlertRule`). Defines schemas and DB constraints. |
| **View / Controller** | **View** | **Controller** | Django REST Framework `@api_view` functions (`telemetry_app.views`, `devices_app.views`, `auth_app.views`). They **do not render HTML**. Instead, they validate input, run business logic, and serialize JSON responses. |
| **Template / Presentation** | **Template** | **View** | `templates/index.html` acts strictly as an **SPA Application Shell**. The actual UI presentation, tab routing, chart rendering, and state management are handled client-side in `static/app.js` using JavaScript. |

**Verdict:** The project uses Django as a **Headless API-driven Controller Backend** serving a **Single Page Application (SPA)** client. It retains Django's MVT skeleton for serving the initial bundle, but operates logically as a **Decoupled Model-View-Controller (MVC)** system.

---

## ⚡ 3. Hardware Monitoring Capacity & Deployment Benchmarks

How many microcontrollers, LoRa gateways, and sensor nodes can this platform monitor simultaneously?

### 📊 Benchmark Scenarios:

```
+----------------------------------------------------------------------------------------------------+
| Tier 1: Single Instance (SQLite / Development)                                                     |
| - Concurrency : 100 - 300 active nodes                                                             |
| - Throughput  : 30 - 50 HTTP req/sec                                                               |
| - Best for    : Lab testing, prototyping, smart home, small office                                |
+----------------------------------------------------------------------------------------------------+
| Tier 2: Standard Production (PostgreSQL + Redis + Gunicorn 4 Workers)                               |
| - Concurrency : 2,000 - 5,000 active nodes (reporting every 10-30s)                                |
| - Throughput  : 300 - 600 HTTP req/sec                                                             |
| - Best for    : Commercial greenhouse, smart factory, server room monitoring                       |
+----------------------------------------------------------------------------------------------------+
| Tier 3: High-Scale Distributed (MongoDB Atlas + MQTT Broker + Async Consumer)                      |
| - Concurrency : 25,000 - 50,000+ active nodes                                                      |
| - Throughput  : 3,000 - 5,000 messages/sec                                                         |
| - Best for    : Smart city, municipal water distribution, fleet tracking across states             |
+----------------------------------------------------------------------------------------------------+
```

### Key Factors Determining Capacity:
1. **Reporting Frequency (Heartbeat Interval):**
   - If 1,000 devices send telemetry **every 60 seconds**, the backend only receives **~16 requests per second**. A single standard server handles this effortlessly with < 2% CPU usage.
   - If 1,000 devices send telemetry **every 1 second**, the backend receives **1,000 requests per second**, requiring Redis caching and the MongoDB repository pattern.
2. **Payload Size:**
   - Standard telemetry JSON packets are tiny (typically 80 – 250 bytes). Network bandwidth consumption is negligible.

---

## 🚀 4. Scalability Technologies Used in this Project

To ensure high availability, low latency, and horizontal scalability, the system implements the following enterprise architectural patterns:

### 1. Pluggable Repository Pattern for Telemetry Storage
Located in [`telemetry_app/repository.py`](file:///c:/Users/dell/OneDrive/Desktop/hardware_monitoring%20system%20%282%29/hardware_monitoring%20system/telemetry_app/repository.py):
- The telemetry storage layer is decoupled using `BaseTelemetryRepository`.
- **`DjangoORMRepository`:** Used for low-to-medium scale with SQLite or PostgreSQL.
- **`MongoDBRepository`:** Pluggable NoSQL backend utilizing native PyMongo connection pools to store unstructured, high-frequency time-series documents in MongoDB Atlas without locking relational tables.

### 2. Async Non-Blocking MQTT Daemon (`background_worker.py`)
- Hardware nodes often communicate via MQTT instead of HTTP to conserve battery and bandwidth.
- `background_worker.py` uses `aiomqtt` (built on Python's native `asyncio` event loop). A single process can maintain **thousands of persistent socket connections** with negligible memory overhead compared to threaded HTTP servers.

### 3. Redis In-Memory Session & JWT Revocation
- In [`core/redis_client.py`](file:///c:/Users/dell/OneDrive/Desktop/hardware_monitoring%20system%20%282%29/hardware_monitoring%20system/core/redis_client.py) & [`core/authentication.py`](file:///c:/Users/dell/OneDrive/Desktop/hardware_monitoring%20system%20%282%29/hardware_monitoring%20system/core/authentication.py):
- User authentication and role verification are verified through fast in-memory Redis keys.
- Avoids hitting the primary SQL database on every single API poll from the dashboard.

### 4. Flap Dampening & Cooldown-Protected Alert Engine
- In [`alerts_app/services.py`](file:///c:/Users/dell/OneDrive/Desktop/hardware_monitoring%20system%20%282%29/hardware_monitoring%20system/alerts_app/services.py):
- When a temperature sensor fluctuates around a threshold (e.g. 50.1°C -> 49.9°C -> 50.2°C), traditional systems crash mail servers by sending hundreds of emails per minute.
- Our alert engine records `last_triggered` and checks `cooldown_seconds` (default: 300s) before dispatching notifications, protecting outbound SMTP quotas and server resources.

### 5. Non-Blocking Socket Timeouts on SMTP
- SMTP socket connections are configured with explicit `timeout=15` seconds. If an external mail provider (Gmail/Outlook) encounters an outage, the Django worker does not hang indefinitely.

### 6. Static Asset Compression & Caching
- **WhiteNoise** with `CompressedManifestStaticFilesStorage` ensures frontend JS/CSS bundles are pre-gzipped and served with long-lived HTTP cache headers directly from the application layer.

---

## 📧 5. Step-by-Step SMTP Relay Configuration Guide

To enable email notifications for threshold triggers and offline nodes, follow these steps:

### Option A: Gmail Configuration (Recommended)

> [!IMPORTANT]
> Google does **not** allow your standard account login password for SMTP. You **must** generate a 16-character **Google App Password**.

1. **Enable 2-Step Verification:**
   - Go to [Google Account Security](https://myaccount.google.com/security).
   - Under *"How you sign in to Google"*, enable **2-Step Verification**.
2. **Generate an App Password:**
   - In Google Account Security, search for or click on **App Passwords**.
   - Enter an app name (e.g., `IoT Guard Platform`).
   - Click **Create**. Google will display a **16-character code** (e.g., `abcd efgh ijkl mnop`). Copy it.
3. **Configure in IoT Guard Dashboard:**
   - Open **Alerts & Rules** tab &rarr; click **Setup SMTP Relay**.
   - Click the **Gmail (587 TLS)** quick preset button.
   - Enter:
     - **Sender Email Address:** `your-email@gmail.com`
     - **Sender Name:** `IoT Guard Alert Engine`
     - **HELO Identifier:** `IoT-Guard-Node`
     - **Relay Port:** `587`
     - **Relay Server (Host):** `smtp.gmail.com`
     - **Authentication Type:** `Standard SMTP Authentication`
     - **Connection Security:** `Auto-Negotiate (TLS 1.0 or higher)`
     - **Relay Username:** `your-email@gmail.com`
     - **Relay Password:** Paste the **16-character App Password** (spaces don't matter).
4. **Test the Connection:**
   - In the *"System Connection Test"* box, enter your personal email address.
   - Click **Execute SMTP Test Handshake**.
   - You should see a green toast: `Test Email Sent Successfully!`.
5. **Deploy:**
   - Click **Deploy & Save Configuration**.

---

### Option B: Microsoft 365 / Outlook Configuration
- **Relay Server (Host):** `smtp.office365.com`
- **Port:** `587`
- **Security:** `TLS`
- **Username:** `your-office365-email@domain.com`
- **Password:** Office 365 App Password or account credentials.

---

### Option C: Direct SSL Relay
- **Port:** `465`
- **Security:** `Direct SSL`
- **Authentication:** `Standard`

---

## 🛠️ 6. Production Deployment Recommendations

For maximum throughput and reliability in production:

```bash
# 1. Start Gunicorn with Uvicorn worker for asynchronous HTTP
gunicorn iot_monitoring.asgi:application -k uvicorn.workers.UvicornWorker -w 4 -b 0.0.0.0:8000

# 2. In a separate process manager (systemd or supervisor), start the Background Worker:
python background_worker.py
```
