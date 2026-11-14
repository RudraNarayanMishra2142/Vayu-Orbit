# PUBLIC DISTRIBUTION AUTHORIZATION DECLARATION
## VAYU ORBIT — Academic Release v6.0.0 (Problem Statement PDS-3)

**Document Status:** FORMAL DRAFT — PENDING COPYRIGHT OWNER SIGNATURE  
**Proposed Authorizing Grantor:** Rudra Narayan Mishra  
**Target Repository:** `RudraNarayanMishra2142/Vayu-Orbit`  
**Target Visibility:** Public (GitHub)  
**Governing Licence:** VAYU ORBIT Proprietary Academic Evaluation Licence v1.0  
**Date of Drafting:** 15 November 2026  

---

> [!CAUTION]
> **LEGAL NOTICE: UNSIGNED FORMAL DRAFT**  
> This document records the proposed terms and scope of authorization for public GitHub hosting of the VAYU ORBIT Academic Release.  
> **Under strict project safety boundaries, the creation or presence of this document does NOT constitute legal authorization to publish, push, or distribute the repository.**  
> Public distribution remains strictly prohibited until this document is reviewed, approved, dated, and signed by the Copyright Owner (Rudra Narayan Mishra).

---

## 1. Project Identification & Parties

- **Project Title:** VAYU ORBIT — Intelligent Convoy Movement Planning & Dynamic Route Optimisation System
- **Academic Context:** Problem Statement PDS-3 (Autonomous / Semi-Autonomous Logistics & Tactical Convoy Scheduling)
- **Author & Sole Copyright Claimant:** Rudra Narayan Mishra (Registration No: 12515636)
- **Academic Institution:** Lovely Professional University, Punjab, India
- **Proposed Hosting Platform:** GitHub Inc. (`https://github.com/RudraNarayanMishra2142/Vayu-Orbit`)

---

## 2. Approved Release Scope & Contents

The authorization granted under this instrument, once signed, applies **strictly and exclusively** to the sanitized Academic Release package located at `academic/VAYU_ORBIT_ACADEMIC_RELEASE/`:

### Included Approved Assets:
1. **Frontend Application Source Code:** React 19 / Vite client source, UI components, Leaflet map overlays, and vehicle SVG vector graphics.
2. **Backend Application Source Code:** FastAPI route definitions, authoritative RBAC middleware, NetworkX routing graph engine, deterministic VORAM scoring service, and audit logging engine.
3. **Reproducible Demo Database & Setup Scripts:** `prepare_demo_db.py`, `seed_demo_scenarios.py`, and `military_logistics_demo.db` (containing 0 operational journeys, 0 incident records, 0 audit logs, and 3 simulation-only mock accounts).
4. **Automated Regression Test Suite:** 80 backend pytest tests, Firebase Auth regression tests, and operational workflow verification scripts.
5. **Academic Documentation & Technical Specs:** README, Product Requirements Document (PRD), Architecture specifications, Third-Party Notices, and Verification reports.
6. **Environment Configuration Templates:** Sanitized `.env.example` templates containing non-functional placeholders.

### Explicitly Excluded Prohibited Assets (Never Authorized for Public Distribution):
- The active operational database (`backend/military_logistics.db`).
- Any database backups, snapshots, or WAL/SHM temporary files.
- Live or active third-party API keys (TomTom API keys, Google Firebase client secret keys).
- Firebase Admin SDK private service-account JSON credentials or cryptographic certificates (`.pem`, `.key`).
- Local environment files (`.env`, `.env.local`, `.env.production`).
- Personal local file paths, machine identifiers, or unapproved records.

---

## 3. Terms of Permitted Public Distribution

Once executed, this authorization grants permission to host the approved release scope publicly on GitHub under the following conditions:
1. **Governing Licence:** The entire public repository shall be governed by the **VAYU ORBIT Proprietary Academic Evaluation Licence v1.0** (as set forth in `LICENSE`).
2. **Permitted Public Actions:** Public viewing, code inspection, downloading, cloning, and local execution solely for non-commercial academic evaluation, coursework review, and educational study.
3. **Prohibited Public Actions:** Commercial exploitation, sublicensing, production military deployment, commercial cloud hosting, and unauthorized modification or redistribution remain strictly reserved by the copyright owner.
4. **Third-Party Rights:** All third-party software dependencies remain subject to their respective open-source licenses as documented in `THIRD_PARTY_NOTICES.md`.
5. **Revocability:** The copyright owner retains the right to revoke public distribution authorization or transition the repository to private status at any time upon written notice.

---

## 4. Execution & Signature Block

*This authorization becomes effective only upon handwritten or verified cryptographic electronic signature by the copyright owner.*

```text
================================================================================
                        AUTHORIZATION SIGNATURE BLOCK
================================================================================

I, Rudra Narayan Mishra, hereby declare that I am the author and sole copyright 
claimant of VAYU ORBIT (Problem Statement PDS-3). I authorize the public hosting 
and academic distribution of the approved VAYU ORBIT release scope on GitHub 
strictly under the terms of the Proprietary Academic Evaluation Licence v1.0.


Printed Name:    Rudra Narayan Mishra

Student Reg No:  12515636

Institution:     Lovely Professional University, Punjab, India

Signature:       __________________________________________________
                 (Unsigned Draft — Pending Copyright Owner Signature)

Date:            ______ / ______ / 2026

================================================================================
```
