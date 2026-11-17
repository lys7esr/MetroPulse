# MetroPulse — Metro Station Anomaly Reporter

## 1. Problem Statement

Urban metro rail networks handle thousands of daily passenger movements across multiple corridors, where operational issues—such as platform overcrowding, escalator or signaling breakdowns, sanitation hazards, safety threats, and sudden medical emergencies—require rapid, accurate reporting and structured escalation.

In conventional or manual reporting setups:
- **Malformed or ambiguous station and anomaly identifiers** delay triage and misroute incidents.
- **Unstructured classification** makes it difficult to separate routine maintenance from high-risk safety or medical incidents.
- **Static or capacity-blind assignment** overloads active response teams while leaving backup teams or priority queues unmanaged.
- **Fragmented visibility** prevents passengers from tracking resolution progress and prevents control rooms from auditing dispatch decisions and corridor workloads.

**MetroPulse** addresses this by providing an end-to-end, deterministic metro station anomaly reporting and operations control platform across three corridors (**East**, **West**, and **Central**), uniting formal automata validation, rule-based classification, capacity-safe dispatch, and real-time tracking in one cohesive system.

---

## 2. What Is in Our Project

### Interactive 3D Metro Landing Experience (`/`)
- **3D Metro Station & Train Hero:** A real-time Three.js scene depicting a 3-car MetroPulse train entering a station on ballasted steel rails, decelerating to a platform stop, and opening/closing sliding doors that transition passengers directly into reporting or tracking (with `prefers-reduced-motion` and WebGL-unavailable fallbacks).
- **Interactive Schematic Corridor Map:** Clickable station prefix nodes across the **West**, **Central**, and **East** corridors showing live SQLite active incident counts, category breakdowns, control room assignments, and the Medical Override bypass route.
- **Live Incident Operations Board:** A departure-board-style public feed filterable by corridor with direct links to inspect individual report timelines.
- **6-Stage Operations Pipeline Overview:** Visual walkthrough of the system lifecycle: `REPORT → VALIDATE → CLASSIFY → ROUTE → ASSIGN → RESOLVE`.

### Automata-Based Input Validation & Reporting Terminal (`/report` & `/validation`)
- **Dual Validation Engine (Python DFA + Regex):** Every **Station Code** (`^STA[A-Z]{2}[0-9]{3}$`) and **Anomaly Code** (`^A[0-9]{2}$`) is normalized (trimmed and uppercased) and independently verified by both an explicit Deterministic Finite Automaton (`StationCodeDFA`, `AnomalyCodeDFA`) and Python `re.fullmatch`.
- **Live State-Transition Trace:** Displays exact character-by-character DFA state transitions (e.g., `q0_START → q1_S → ... → q8_ACCEPT` or `q_DEAD`) and live DFA-vs-Regex agreement.
- **Automata Validation Lab (`/validation`):** An interactive playground to test codes, inspect the equivalence corpus, and review all **24 automated system test cases**.

### Deterministic Classification & Corridor Routing Engine
- **Five-Category Classification:** Mapped anomaly codes resolve deterministically to exactly one category—**Safety**, **Technical**, **Crowd**, **Cleanliness**, or **Medical**—with conflict priority auditing and explicit rejection of unmapped codes (e.g., `A99`).
- **Station-Prefix Corridor Routing:** Configurable routing tables map station prefixes (e.g., `STAEC`/`STAED` → East, `STAWC`/`STAWX` → West, `STACC`/`STACM` → Central) to their respective control rooms, while unknown prefixes are routed to a Fallback Correction Queue.
- **Medical Emergency Override:** Any **Medical** anomaly (`A05`) automatically escalates to **P0 · Emergency** priority and overrides standard corridor assignment to route directly to the **Central Emergency Line**.

### Capacity-Safe Dispatch & Multi-Dashboard Operations Suite
- **Transaction-Safe Dispatch:** Uses thread locking and SQLite `BEGIN IMMEDIATE` transactions to enforce handler eligibility (`enabled`, `Available`, and `active_load < capacity_limit`). When primary handlers are full or unavailable, reports fall back to backup handlers or deterministic priority queues (`priority_rank ASC, queued_at ASC, report_id ASC`).
- **User Tracking Dashboard (`/track`):** Lets passengers look up any unique Report ID to view classification, corridor/handler assignment, and a 4-stage visual timeline while keeping private reporter contact details hidden.
- **Handler Operations Console (`/handler`):** Staff-authenticated workspace to filter/sort assigned incidents, toggle handler availability (`Available` / `Busy` / `Offline`), adjust capacity limits, and execute validated lifecycle transitions (`Pending → Assigned → In Progress → Resolved`).
- **Routing Management Dashboard (`/routing`):** Admin/staff interface for viewing and editing station-prefix tables, corridor-by-category rules, live handler load, fallback/waiting queues, and the dispatch decision audit log.
- **Operations Analytics Dashboard (`/analytics`):** Multi-filter visualizations (date range, corridor, category, and status) powered strictly by persisted SQLite records, showing corridor volume, category distribution, status breakdown, handler utilization, and average resolution time.

---

## 3. Tech Stack

### Frontend
- **Framework & Language:** React 19, TypeScript, Vite
- **Routing & UI:** React Router, Tailwind CSS, Lucide React
- **3D & Data Visualization:** Three.js (interactive 3D station and train scene), Recharts (bar and donut analytics charts)

### Backend
- **Framework & Language:** Python 3, Flask (REST APIs)
- **Validation & Automata:** Explicit Python DFA state-machine implementations (`StationCodeDFA`, `AnomalyCodeDFA`) paired with Python `re` (`fullmatch`)
- **Authentication & Concurrency:** Signed HMAC-SHA256 Bearer tokens for role-based staff/admin access (`Handler` and `Routing Admin`), thread locks, and atomic database transactions

### Database & Runtime Integration
- **Database & ORM:** SQLite (WAL mode with foreign keys enforced) and SQLAlchemy ORM across 9 relational tables (`reports`, `handlers`, `assignments`, `routing_rules`, `station_routes`, `anomaly_mappings`, `dispatch_logs`, `status_history`, `queues`)
- **Gateway / Dev Server:** Node.js + Express reverse proxy serving the Vite/React frontend and forwarding `/api/*` traffic to the Flask backend
