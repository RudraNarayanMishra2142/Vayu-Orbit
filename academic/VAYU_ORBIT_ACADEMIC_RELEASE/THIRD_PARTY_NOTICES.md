# THIRD-PARTY SOFTWARE NOTICES & ATTRIBUTIONS

**Project:** VAYU ORBIT — Academic Evaluation Package (v6.0.0)  
**Author:** Rudra Narayan Mishra  
**Last Updated:** November 2026  

This document provides verified attribution notices, copyright records, and licensing terms for third-party software components, libraries, fonts, and cartographic data integrated into the VAYU ORBIT prototype.

---

## 1. BACKEND PYTHON DEPENDENCIES

All backend Python packages are managed via `backend/requirements.txt` and executed in a local Python 3.11+ environment.

| Package Name | Installed Version | Declared Licence | Copyright Owner / Authors | Primary Source / Repository | Redistribution & Usage Terms |
|---|---|---|---|---|---|
| **fastapi** | `0.142.2` | MIT | Sebastián Ramírez | https://github.com/fastapi/fastapi | Permissive commercial & academic use; retain copyright notice. |
| **uvicorn** | `0.54.0` | BSD-3-Clause | Encode OSS Ltd | https://github.com/encode/uvicorn | Permissive; retain BSD 3-Clause notice and disclaimer. |
| **pydantic** | `2.13.5` | MIT | Samuel Colvin & Contributors | https://github.com/pydantic/pydantic | Permissive; retain copyright notice. |
| **networkx** | `3.6.1` | BSD-3-Clause | NetworkX Developers | https://github.com/networkx/networkx | Permissive; graph algorithms for Dijkstra shortest path. |
| **pandas** | `2.3.0` | BSD-3-Clause | AQR Capital Management, Lambda Foundry, PyData | https://github.com/pandas-dev/pandas | Permissive; analytical tabular operations. |
| **ortools** | `9.15.6755` | Apache-2.0 | Google LLC | https://github.com/google/or-tools | Operations research suite; Apache 2.0 license terms apply. |
| **PyJWT** | `2.13.0` | MIT | José Padilla & Contributors | https://github.com/jpadilla/pyjwt | Permissive; JSON Web Token authentication encoding/decoding. |
| **passlib** | `1.7.4` | BSD-3-Clause | Eli Collins | https://foss.heptapod.net/python-libs/passlib | Password hashing infrastructure; BSD notice retained. |
| **bcrypt** | `4.1.3` | Apache-2.0 | The Python Cryptographic Authority (PyCA) | https://github.com/pyca/bcrypt | Password hashing backends; Apache 2.0 terms apply. |
| **reportlab** | `4.4.10` | BSD-3-Clause | ReportLab Inc. | https://www.reportlab.com | PDF generation engine; Open-source edition. |
| **pillow** | `11.3.0` | HPND | Alex Clark & Contributors | https://github.com/python-pillow/Pillow | Image processing for PDF report headers; HPND permissive. |

---

## 2. FRONTEND JAVASCRIPT & NPM DEPENDENCIES

All frontend client dependencies are specified in `frontend/package.json` and locked in `frontend/package-lock.json`.

| Package Name | Installed Version | Declared Licence | Copyright Owner / Authors | Primary Source / Repository | Redistribution & Usage Terms |
|---|---|---|---|---|---|
| **react** | `19.3.0` | MIT | Meta Platforms, Inc. and affiliates | https://github.com/facebook/react | Core component rendering engine; retain MIT notice. |
| **react-dom** | `19.3.0` | MIT | Meta Platforms, Inc. and affiliates | https://github.com/facebook/react | DOM rendering engine for React; retain MIT notice. |
| **vite** | `8.3.3` | MIT | Evan You & Vite Contributors | https://github.com/vitejs/vite | Modern client bundler & local dev server; retain MIT notice. |
| **@vitejs/plugin-react** | `6.1.2` | MIT | Vite Contributors | https://github.com/vitejs/vite-plugin-react | Fast Refresh plugin for Vite; retain MIT notice. |
| **leaflet** | `1.9.4` | BSD-2-Clause | Volodymyr Agafonkin & Leaflet Contributors | https://github.com/Leaflet/Leaflet | Interactive 2D mapping engine; retain BSD 2-Clause notice. |
| **lucide-react** | `1.52.0` | ISC | Lucide Project Contributors | https://github.com/lucide-icons/lucide | Tactical iconography library; ISC permissive licence. |

---

## 3. CARTOGRAPHIC DATA & MAP TILE ATTRIBUTIONS

The VAYU ORBIT MapView component dynamically displays geographical maps for convoy route visualization.

### A. OpenStreetMap Data
- **Provider:** OpenStreetMap Foundation (OSMF)
- **Licence:** Open Database License (ODbL) 1.0
- **Attribution Notice Required:** `© OpenStreetMap contributors`
- **Terms:** Map data is queried dynamically in real-time. No raw OpenStreetMap database extracts or geometries are redistributed statically within this package.

### B. CartoDB Positron / Basemaps Tiles
- **Provider:** CARTO
- **Licence:** Creative Commons Attribution 3.0 (CC BY 3.0)
- **Attribution Notice Required:** `© CARTO, © OpenStreetMap contributors`
- **Notice on Map Tiles:** Map tiles are streamed dynamically over HTTPS during active prototype execution. No proprietary tiles are downloaded, bundled, or claimed as proprietary property by VAYU ORBIT.

---

## 4. TYPOGRAPHY & DIGITAL FONTS

The VAYU ORBIT tactical user interface embeds selected digital web fonts via Google Fonts:

- **Orbitron:** Designed by Matt McInerney. Licensed under the **SIL Open Font License 1.1 (OFL)**.
- **Share Tech Mono:** Designed by Carrois Apostrophe. Licensed under the **SIL Open Font License 1.1 (OFL)**.
- **Inter:** Designed by Rasmus Andersson. Licensed under the **SIL Open Font License 1.1 (OFL)**.

All fonts are freely usable for academic and software development purposes under the SIL OFL terms without royalties.

---

## 5. DISCLAIMER & LEGAL AUDIT CLAUSE

The above listings represent a thorough review of direct and runtime dependencies. All trademarks, service marks, and trade names referenced herein remain the property of their respective owners. Mention of commercial vehicle manufacturers (e.g., Tata Motors, Ashok Leyland, Mahindra Defence, Scania, Maruti Suzuki, BEML) is strictly for academic modeling and simulated logistical categorization; no endorsement or sponsorship by these entities is claimed or implied.
