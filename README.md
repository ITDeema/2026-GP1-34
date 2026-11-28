# Maamar (معمـار)

> An AI-powered environmental site analysis web platform for residential plots in Riyadh.

King Saud University · Department of Information Technology · IT496 Project

## Introduction
Maamar is a decision-support platform that automates the environmental and contextual analysis of residential plots in Riyadh. It helps homeowners and architects make informed, Saudi-code-compliant design decisions before construction begins. The system evaluates solar exposure, wind, shading, noise, and surrounding urban density, and presents the results in a dashboard with design decisions.

## Core Features
- Two account types: homeowners get simplified results,
  while architects get detailed indicators
- Hybrid analysis: physics-based calculations, a rule-based compliance layer, and machine learning classifiers
- Interactive plot selection on a map of Riyadh
- History and favorites: review, rename, search, and favorite past analyses
- Account management (sign-up, login, password change, account deletion with a 7-day grace period)
- Bilingual interface: Arabic (RTL) and English (LTR)

## Technologies Used
| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Maps | Leaflet, OpenStreetMap, ArcGIS World Imagery |
| Backend | Python, FastAPI, Uvicorn |
| Geospatial / solar | GeoPandas, Shapely, PyProj, pvlib |
| Database & Auth | Supabase (PostgreSQL, Auth, Row Level Security) |
| Data sources | OpenStreetMap (Overpass), ArcGIS parcels, Global Building Atlas, ERA5-Land |

## Project Structure
```
Maamar-GP/
├── README.md
├── AUTHORS
├── frontend/     # Next.js web app (app/, components/, lib/)
├── backend/      # FastAPI analysis services
├── supabase/     # SQL schema and migrations
├── docs/         # Sprint documents
├── DataSet_Phase1.ipynb   # Dataset building notebook
└── DataSet_Phase2.ipynb   # Design-decision labels (rules v1.2)
```

## Launch Instructions

### Prerequisites
Git, Node.js 20.9+, Python 3.10+, a Supabase project.

### 1. Clone
```bash
git clone https://github.com/<owner>/<repository>.git
cd <repository>
```

### 2. Backend
```bash
cd backend
python -m venv .venv
source .venv\Scripts\activate        # mac: .venv\bin\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Frontend
Create `frontend/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
SUPABASE_SECRET_KEY=<secret key>   # server only, used for account deletion
```
Then:
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:3000.

## Team
See [AUTHORS](AUTHORS).
