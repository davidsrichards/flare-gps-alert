# Flare GPS Alert App - Architecture & Windsurf Agent Guide

## System Overview

**App Name:** Flare GPS Alert App  
**Core Purpose:** Rapid crime and distress reporting application connecting Citizens directly to Security Agencies and Administrators with real-time GPS telemetry and instant push notifications.

---

## 3-Role Access Model & Capabilities

1. **Citizen / Victim (Free Registration)**
   * **Registration:** Open to the public via app signup (`role: 'citizen'`).
   * **Core Action:** One-touch panic alert button that captures hardware GPS (`latitude`, `longitude`, `accuracy < 10m`).
   * **View:** Personal alert status and local public safety incident map.

2. **Security Agency (Admin-Created Only)**
   * **Registration:** Created strictly by an Admin (`role: 'security'`). Includes optional `badge_number`.
   * **Push Notification Receiver:** Automatically registers device `expo_push_token` on login.
   * **Responder View:** Receives loud mobile push notification when a victim within range triggers a distress alert. Tapping the banner opens an interactive map showing the victim's live location and distance.
   * **Action:** Updates incident status (`ACTIVE` $\rightarrow$ `RESPONDING` $\rightarrow$ `RESOLVED`).

3. **Admin (System Controller)**
   * **Registration:** Pre-seeded super-user account (`role: 'admin'`).
   * **Capabilities:** Dedicated management tab to onboard Security Officers, view system logs, and override incident statuses.

---

## Architecture & Data Flow Diagram

```
[ Citizen Device ] 
   │ 1. Tap Panic Button (expo-location captures Lat/Lng)
   └── POST /api/incidents (with JWT)
            │
            ▼
[ Node.js + Express Backend Server ]
   │ 2. Save Incident to PostgreSQL Database
   │ 3. Query Security Users (Role = 'security')
   │ 4. Filter Officers by Distance (Haversine Formula <= 10km)
   │ 5. Payload -> Expo Push Server API (https://exp.host/--/api/v2/push/send)
            │
            ▼
[ Expo Push Server ]
            │ (Sends instant push notification)
            ▼
[ Security Agency Devices ]
   │ 6. Device rings/buzzes banner: "🚨 DISTRESS ALERT: Robbery nearby!"
   └── 7. Tapping notification opens Map centered on Victim's GPS Marker
```

---

## Database Schema (PostgreSQL / Supabase)

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Role Enum
CREATE TYPE user_role AS ENUM ('citizen', 'security', 'admin');

-- Incident Status Enum
CREATE TYPE incident_status AS ENUM ('active', 'responding', 'resolved');

-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role DEFAULT 'citizen',
    badge_number VARCHAR(100),
    expo_push_token TEXT,
    last_latitude DOUBLE PRECISION,
    last_longitude DOUBLE PRECISION,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Incidents Table
CREATE TABLE incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    victim_id UUID REFERENCES users(id) ON DELETE CASCADE,
    victim_name VARCHAR(255) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    incident_type VARCHAR(100) DEFAULT 'Distress Alert',
    description TEXT DEFAULT '',
    status incident_status DEFAULT 'active',
    assigned_security_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## Nearest Responder Routing Logic (Haversine Formula)

When a distress payload is received, Express executes the Haversine formula to compute distance $d$ in kilometers between the victim's location $(\phi_1, \lambda_1)$ and each logged-in security officer's location $(\phi_2, \lambda_2)$:

$$a = \sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)$$
$$c = 2 \cdot \text{atan2}\left(\sqrt{a}, \sqrt{1-a}\right)$$
$$d = R \cdot c \quad \text{where } R = 6371\text{ km}$$

### Utility Code (TypeScript)

```typescript
export function calculateDistanceKm(
  lat1: number, lon1: number, 
  lat2: number, lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
```

---

## REST API Endpoint Specification

### Auth Routes (`/api/auth`)

* **`POST /api/auth/register`**
  * **Access:** Public (Registers `role: 'citizen'`).
  * **Body:** `{ "email", "password", "full_name" }`
  * **Response:** `{ "token", "user": { id, email, full_name, role } }`

* **`POST /api/auth/login`**
  * **Access:** Public.
  * **Body:** `{ "email", "password" }`
  * **Response:** `{ "token", "user": { id, email, full_name, role } }`

### Admin Routes (`/api/admin`) - Protected (`role: 'admin'`)

* **`POST /api/admin/create-security`**
  * **Headers:** `Authorization: Bearer <JWT>`
  * **Body:** `{ "email", "password", "full_name", "badge_number" }`
  * **Response:** `{ "message": "Security Officer account created successfully" }`

### User Management Routes (`/api/users`) - Protected

* **`PUT /api/users/device-telemetry`**
  * **Headers:** `Authorization: Bearer <JWT>`
  * **Body:** `{ "expo_push_token": "ExponentPushToken[xxx]", "latitude": 8.8471, "longitude": 8.5222 }`
  * **Action:** Updates device push token and last-known location for security dispatch.

### Incident Routes (`/api/incidents`) - Protected

* **`POST /api/incidents`**
  * **Headers:** `Authorization: Bearer <JWT>`
  * **Body:** `{ "latitude": 8.8471, "longitude": 8.5222, "incident_type": "Armed Robbery", "description": "Near Main Campus Gate" }`
  * **Server Action:**
    1. Saves incident record with `status: 'active'`.
    2. Fetches all users with `role = 'security'` and valid `expo_push_token`.
    3. Filters officers within 10 km (falls back to all officers if none within 10 km).
    4. Sends HTTP POST request to `https://exp.host/--/api/v2/push/send`.
  * **Response:** `{ "message": "Distress alert broadcasted to nearest responders", "incident": { ... } }`

* **`GET /api/incidents`**
  * **Headers:** `Authorization: Bearer <JWT>`
  * **Response:** Array of incident records with victim info, GPS coordinates, and status.

* **`PATCH /api/incidents/:id/status`**
  * **Headers:** `Authorization: Bearer <JWT>` (Security or Admin only)
  * **Body:** `{ "status": "responding" | "resolved" }`
  * **Response:** Updated incident record.

---

## Mobile Client Layout & Screen Flow

```
mobile/src/
├── context/
│   └── AuthContext.tsx              # Stores User Token & Role
├── navigation/
│   ├── AppNavigator.tsx             # Routes based on Role
│   ├── CitizenStack.tsx             # Panic Screen + User Map
│   ├── SecurityStack.tsx            # Emergency Feed + Interactive Map + Route Action
│   └── AdminStack.tsx               # Security Officer Onboarding + Audit Log
├── screens/
│   ├── LoginScreen.tsx
│   ├── RegisterCitizenScreen.tsx
│   ├── CitizenPanicScreen.tsx       # Giant Red Panic Button + Instant GPS trigger
│   ├── SecurityDashboardScreen.tsx  # Incoming Emergency Alerts list & map
│   ├── MapViewScreen.tsx            # Map component with Markers & Callouts
│   └── AdminCreateSecurityScreen.tsx
├── services/
│   ├── api.ts                       # Axios Client with Auth Interceptor
│   └── pushNotifications.ts         # Expo Push Notification Token Requester
```

---

## Step-by-Step Windsurf Agent Prompts

Copy and paste these exact prompts sequentially into your **Windsurf Agent**.

### Phase 1: Express Backend Setup

#### Prompt 1: Backend Setup & Dependencies
```
Create a complete Node.js + Express + TypeScript server in a folder named 'backend'.
Dependencies in package.json:
express, cors, dotenv, jsonwebtoken, bcryptjs, @supabase/supabase-js, typescript, ts-node-dev, @types/node, @types/express, @types/cors, @types/jsonwebtoken, @types/bcryptjs.
Create tsconfig.json and src/index.ts with CORS and health check route GET /health on port 5000.
```

#### Prompt 2: Database Configuration & TypeScript Types
```
Inside 'backend/src':
1. Create 'config/db.ts' connecting to Supabase/PostgreSQL.
2. Create 'types/index.ts' defining interfaces for User (id, email, password_hash, full_name, role ['citizen'|'security'|'admin'], badge_number, expo_push_token, last_latitude, last_longitude), Incident (id, victim_id, victim_name, latitude, longitude, incident_type, description, status ['active'|'responding'|'resolved'], assigned_security_id, created_at), and Express Request with decoded user context.
```

#### Prompt 3: Auth Controllers & Middleware
```
Inside 'backend/src':
1. Create 'middleware/authMiddleware.ts' to verify JWT and attach user payload (id, email, role) to the request. Also create a roleCheck middleware (e.g. requireRole(['admin']) or requireRole(['security', 'admin'])).
2. Create 'controllers/authController.ts':
   - registerCitizen: registers user with role 'citizen', hashes password, returns JWT and user.
   - login: checks credentials, returns JWT and user (including role).
3. Create 'controllers/adminController.ts':
   - createSecurityOfficer: restricted to 'admin' role, creates a user with role 'security' and badge_number.
4. Mount routes under '/api/auth' and '/api/admin' in src/index.ts.
```

#### Prompt 4: Push Notification Helper & Haversine Distance Logic
```
Inside 'backend/src/utils':
1. Create 'geo.ts' export function calculateDistanceKm(lat1, lon1, lat2, lon2) using the Haversine formula.
2. Create 'notifications.ts' export function sendExpoPushNotifications(tokens: string[], title: string, body: string, data: object) using fetch to POST to 'https://exp.host/--/api/v2/push/send'.
```

#### Prompt 5: Incident Controller with Push Alert Dispatch
```
Inside 'backend/src':
1. Create 'controllers/incidentController.ts':
   - createIncident: Protected endpoint. Receives latitude, longitude, incident_type, description. Saves incident to database with status 'active'. Queries all users with role 'security' and non-null expo_push_token. Calculates distance using calculateDistanceKm; filters those within 10km (or all security users if none within 10km). Sends push notifications via sendExpoPushNotifications.
   - getIncidents: Returns all incidents ordered by created_at DESC.
   - updateIncidentStatus: Restricted to 'security' or 'admin'. Updates status to 'responding' or 'resolved'.
2. Mount under '/api/incidents' and '/api/users' (for device-telemetry update) in src/index.ts.
```

---

### Phase 2: React Native Expo Client Setup

#### Prompt 6: Expo Project Initialization & Role Navigation
```
Initialize a React Native Expo project using TypeScript in a folder named 'mobile'.
Install: @react-navigation/native, @react-navigation/native-stack, @react-navigation/bottom-tabs, react-native-screens, react-native-safe-area-context, axios, @react-native-async-storage/async-storage, expo-location, expo-notifications, react-native-maps.

Set up AuthContext in 'src/context/AuthContext.tsx' holding user state, role, JWT token, and login/logout methods.
Set up AppNavigator in 'src/navigation/AppNavigator.tsx' to conditionally render:
- AuthStack (Login, RegisterCitizen) if not logged in.
- CitizenStack (PanicScreen, MapScreen) if role === 'citizen'.
- SecurityStack (SecurityDashboardScreen, MapScreen) if role === 'security'.
- AdminStack (AdminCreateSecurityScreen, AuditLogsScreen) if role === 'admin'.
```

#### Prompt 7: Push Notifications & Axios Setup
```
Inside 'mobile/src':
1. Create 'services/api.ts' setting up an Axios instance that reads the JWT token from AsyncStorage and attaches 'Authorization: Bearer <token>'.
2. Create 'services/pushNotifications.ts' that requests Expo notification permissions (`Notifications.requestPermissionsAsync()`), gets the Expo push token (`Notifications.getExpoPushTokenAsync()`), and calls PUT /api/users/device-telemetry with the token and device coordinates.
```

#### Prompt 8: Citizen Panic Screen
```
In 'mobile/src/screens/CitizenPanicScreen.tsx':
1. Display a prominent red circular button "TRIGGER FLARE EMERGENCY".
2. Incident type selector dropdown (Robbery, Assault, Medical Emergency, Suspicious Activity).
3. On button press:
   - Request location permission via `Location.requestForegroundPermissionsAsync()`.
   - Capture current location via `Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })`.
   - Post payload to 'POST /api/incidents'.
   - Display success confirmation banner: "Distress signal broadcasted to nearest security units!".
```

#### Prompt 9: Security Responder Dashboard & Map Screen
```
In 'mobile/src/screens/SecurityDashboardScreen.tsx' & 'MapViewScreen.tsx':
1. Dashboard displays active emergency alerts feed with victim name, incident type, distance, timestamp, and status tag.
2. Render 'react-native-maps' MapView with markers:
   - Red pins for ACTIVE incidents.
   - Yellow pins for RESPONDING incidents.
   - Green pins for RESOLVED incidents.
3. Tapping an incident marker shows callout with action buttons: "Mark Responding" or "Mark Resolved" calling PATCH /api/incidents/:id/status.
```

#### Prompt 10: Admin Security Onboarding Screen
```
In 'mobile/src/screens/AdminCreateSecurityScreen.tsx':
Create a simple form for Admin users to register new Security Personnel: Full Name, Email, Password, Badge/ID Number. Calls 'POST /api/admin/create-security'. Show success alert on creation.
```

---

## Defensive Presentation Instructions

1. **Pre-load Admin & Security Accounts:** Run a database seed script creating `admin@flare.com` and 2 security accounts (`officer1@flare.com`, `officer2@flare.com`).
2. **Setup 2 Test Phones during Defense:**
   * **Phone A (Citizen):** Logged in as `citizen@test.com`.
   * **Phone B (Security Responder):** Logged in as `officer1@flare.com` with push notifications enabled.
3. **Live Demonstration:**
   * Trigger the Panic Button on Phone A.
   * Phone B instantly receives a push notification banner: **"🚨 EMERGENCY ALERT LOGGED"**.
   * Tap the banner on Phone B to open the incident map directly pinned to Phone A's location.