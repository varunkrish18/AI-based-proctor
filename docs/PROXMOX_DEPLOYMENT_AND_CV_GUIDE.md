# AI Proctoring System: Proxmox Setup, Architecture & CV Documentation

This document serves as a persistent, permanent reference for the **AI Online Examination & Proctoring System (AEPS)**, detailing our Proxmox infrastructure, deployment configurations, computer vision algorithms, troubleshooting steps, and access routes.

---

## 1. System & Architecture Overview

The system consists of 4 Dockerized microservices orchestrated via `docker-compose.yml`:

```mermaid
graph TD
    Client["Browser / Student / Admin"] -->|Port 443 (HTTPS) / Port 80| Nginx["Nginx Reverse Proxy (Frontend Container)"]
    Nginx -->|SPA Static Bundle| React["React 19 + Vite Frontend"]
    Nginx -->|/api/ REST API| Backend["Spring Boot 3 (Java 21) REST Backend (:8080)"]
    Nginx -->|/ws WebSockets| Backend
    Backend -->|Frame Telemetry| AI["FastAPI AI Vision Service (:8000)"]
    Backend -->|JDBC / Flyway| DB[("PostgreSQL 16 (:5433 -> :5432)")]
```

* **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Recharts.
* **Backend**: Spring Boot 3, Java 21, Spring Security (JWT), Flyway, PostgreSQL 16.
* **AI Computer Vision**: FastAPI, OpenCV, MediaPipe Tasks, ONNX Runtime.
* **Database**: PostgreSQL 16 containerized with volume persistence (`exam_pg_data`).

---

## 2. Proxmox VE Infrastructure Details

* **Proxmox Host**: `pve` (`https://proxmox.campus-notes.in:8006` or `https://172.15.16.1:8006`)
* **Host IP**: `172.15.16.1`
* **Target Container**: **LXC 120**
  * Container IP: `172.15.14.140`
  * Working Directory: `/opt/AI-based-proctor`
* **PVE Host Reverse Proxy (`socat` systemd services)**:
  * `proctor-proxy.service`: Listens on `0.0.0.0:80` $\rightarrow$ forwards to `172.15.14.140:80`
  * `proctor-ssl-proxy.service`: Listens on `0.0.0.0:443` $\rightarrow$ forwards to `172.15.14.140:443`

---

## 3. Computer Vision & Proctoring Engine

### Camera Occlusion / Covered Lens Detection
When a candidate attempts to cover or obscure their webcam (using hands, fingers, paper, tape, or by turning off all lights), the system detects this within **2.5 seconds** and flags it:

1. **Algorithm (`ai-service/app/models/face_detector.py`)**:
   * Evaluates frame illumination and texture when `face_count == 0`:
     * **Dark / Black Cover**: $\text{Mean Brightness} < 25.0$ (pitch black or hand firmly blocking lens).
     * **Direct Hand/Finger Pressure**: $\text{Mean Brightness} < 45.0$ with $\text{Std Dev} < 12.0$ and $\text{Laplacian Variance} < 15.0$ (uniform reddish/dark skin with no high-frequency edges).
     * **Flat Occlusion (Paper/Tape/Cardboard)**: $\text{Std Dev} < 6.0$ and $\text{Laplacian Variance} < 10.0$ (uniform color, zero surface textures).
   * Emits `cameraCovered: true` and a `CAMERA_COVERED` event.
   * If normal lighting and room texture exist but no face is in view, flags `FACE_NOT_VISIBLE` instead.

2. **Backend Risk Engine & Penalties**:
   * `CAMERA_COVERED`: Triggers after $\ge 2$ seconds, repeats every 10 seconds if continuously covered, incurring a heavy **30-point risk score penalty**.
   * `FACE_NOT_VISIBLE`: Triggers after $\ge 5$ seconds, repeats every 15 seconds.

3. **Frontend 3-Strike Enforcement (`ExamTake.tsx`)**:
   * If covered for $\ge 2.5$ seconds: Takes an evidence snapshot, logs `CAMERA_COVERED`, and fires an official **Warning Strike**:
     > *"Your webcam appears to be covered or blocked. Keep your camera clear and your face fully visible."*
   * Displays an immediate pulsing overlay: **🚫 CAMERA COVERED** and status pill **🚨 Camera Covered**.
   * Reaching 3 strikes automatically terminates and submits the exam.

---

## 4. How to Access the Application

### Option A: Direct HTTPS (Recommended for Webcam & Mic Access)
* **URL**: `https://172.15.16.1` *(or `https://172.15.14.140`)*
* **SSL Note**: Since the Nginx reverse proxy uses a self-signed certificate (`proctor.crt` / `proctor.key`), click **Advanced $\rightarrow$ Proceed to 172.15.16.1 (unsafe)** once. Modern browsers require HTTPS (or localhost) to grant camera/mic permissions.

### Option B: Local SSH Tunnel (Bypasses all SSL warnings)
From your local terminal:
```bash
ssh -L 8081:172.15.14.140:80 root@proxmox.campus-notes.in
```
Then open:
* **URL**: `http://localhost:8081`

---

## 5. Key Portals & Login Credentials

### Student Exam Portal
* **Available Exams**: `https://172.15.16.1/exams`
* **Direct Active Exam Links**:
  * **Exam 6 (`test1` - DS)**: `https://172.15.16.1/exam/6/verify`
  * **Exam 7 (`oop` - Java)**: `https://172.15.16.1/exam/7/verify`
  * **Exam 9 (`DSA` - SZ)**: `https://172.15.16.1/exam/9/verify`

### Admin Portal & Monitoring Dashboard
* **Admin Login**: `https://172.15.16.1/admin/login`
  * **Default Email**: `admin@proctor.com`
* **Admin Dashboard**: `https://172.15.16.1/admin/dashboard`
  * Live risk timelines, attempt inspection, evidence snapshots, and warning logs.
* **Create New Exam**: `https://172.15.16.1/admin/exams/new`

### Internal Endpoints
* **FastAPI AI Vision Docs**: `http://172.15.14.140:8000/docs`
* **Spring Boot API**: `https://172.15.16.1/api/` (or `http://172.15.14.140:8080`)

---

## 6. Maintenance & Container Commands

Run these on the Proxmox host or inside LXC 120:

```bash
# Enter LXC container
pct enter 120

# Navigate to repo
cd /opt/AI-based-proctor

# Pull latest updates from Git
git pull origin main

# Rebuild and restart specific service
docker compose build ai-service && docker compose up -d ai-service
docker compose build backend && docker compose up -d backend
docker compose build frontend && docker compose up -d frontend

# Check container logs
docker logs proctor_ai_service --tail 50 -f
docker logs proctor_backend --tail 50 -f
docker logs proctor_frontend --tail 50 -f
```

---

## 7. Git Repository
* **GitHub**: `https://github.com/varunkrish18/AI-based-proctor`
* **Active Branch**: `main`
