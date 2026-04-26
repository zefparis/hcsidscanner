# HCS ID Scanner

Open-source KYC identity verification — **no Signicat, no third-party
identity API**. The whole flow runs in-app:

1. **Document scan** — `react-webcam` capture, MRZ extracted server-side
   with `mrz-detection` (segmentation + OCR) and parsed with `mrz` (full
   ICAO check-digit validation).
2. **Selfie + face match** — `react-webcam` selfie compared with the
   document recto via **AWS Rekognition CompareFaces** (≈ $0.001 / call).
3. **Verdict + register** — composite KYC score posted to HCS-U7.

Zero external redirect. Zero paid API except Rekognition.

## Stack

| Layer       | Choice                                              |
| ----------- | --------------------------------------------------- |
| Framework   | React 19 + Vite 8 + TypeScript                      |
| State       | zustand (`useIDVerification`)                       |
| Routing     | react-router-dom v7                                 |
| Camera      | react-webcam                                        |
| MRZ         | `mrz-detection` (image-js + OCR) + `mrz` (parse)    |
| Face match  | `@aws-sdk/client-rekognition` CompareFaces          |
| Server code | Vite middleware (dev) → Vercel serverless (prod)    |

## Layout

```
hcs-id-scanner/
├─ api/
│  ├─ _helpers.ts        ← Vercel-style http helpers
│  ├─ analyze-mrz.ts     ← POST /api/analyze-mrz
│  └─ face-match.ts      ← POST /api/face-match
├─ src/
│  ├─ components/
│  │  ├─ DocumentScanner.tsx     (Étape 1)
│  │  ├─ FaceMatch.tsx           (Étape 2)
│  │  ├─ IDVerificationResult.tsx (Étape 3)
│  │  └─ Stepper.tsx
│  ├─ hooks/
│  │  └─ useIDVerification.ts    ← zustand store + apiPost
│  ├─ lib/
│  │  └─ theme.ts                ← HCS-U7 dark theme tokens
│  ├─ App.tsx
│  └─ main.tsx
├─ vite-plugin-api.ts            ← mounts /api/* in dev
└─ vite.config.ts
```

## Environment

| Variable                    | Where  | Notes                              |
| --------------------------- | ------ | ---------------------------------- |
| `VITE_HCS_API_URL`          | client | HCS-U7 KYC ingestion endpoint      |
| `VITE_HCS_TENANT_ID`        | client | tenant tag passed in the payload   |
| `AWS_ACCESS_KEY_ID`         | server | IAM key with Rekognition access    |
| `AWS_SECRET_ACCESS_KEY`     | server |                                    |
| `AWS_REGION`                | server | default `eu-west-1`                |
| `SUPABASE_URL` (opt.)       | server | optional — portrait persistence    |
| `SUPABASE_SERVICE_ROLE_KEY` | server |                                    |
| `SUPABASE_BUCKET`           | server | default `kyc-documents`            |

See `.env.example`.

## API contract

### `POST /api/analyze-mrz`

```jsonc
// request
{ "imageBase64": "<JPEG, with or without data: prefix>" }
// 200
{
  "firstName": "JEAN",
  "lastName": "DUPONT",
  "nationality": "FRA",
  "dateOfBirth": "1985-04-12",
  "documentNumber": "12AB34567",
  "expirationDate": "2030-04-11",
  "documentType": "P",
  "issuingCountry": "FRA",
  "sex": "M",
  "isExpired": false,
  "checkDigitsValid": true,
  "rawMRZ": ["P<FRADUPONT<<JEAN<<<<<<<<<<<<<<<<<<<<<<<<<<<", "12AB345672FRA8504128M3004115<<<<<<<<<<<<<<06"]
}
// errors
{ "error": "no_mrz_found" | "parse_failed" | "invalid_request" }
```

### `POST /api/face-match`

```jsonc
{
  "sourceImageBase64": "<live selfie JPEG>",
  "targetImageBase64": "<document recto JPEG>"
}
// 200
{ "similarity": 92.4, "confidence": 99.8, "isMatch": true, "threshold": 80 }
```

Threshold = 80 % (selfie vs paper photo, no NFC chip portrait).
Image bytes are never logged — only numeric verdicts.

## KYC composite score

```
score = (mrzValid ? 1.0 : 0.5) * 0.6   +   (similarity / 100) * 0.4
       └────────── 60 % ──────────┘     └──────── 40 % ────────┘
```

Where `mrzValid = checkDigitsValid && !isExpired`. Posted to
`VITE_HCS_API_URL/api/kyc/register`.

## Dev

```bash
npm install
cp .env.example .env.local        # fill AWS keys
npm run dev                        # http://localhost:5173
```

The dev server mounts `api/*` handlers in-process via `vite-plugin-api.ts`,
so MRZ analysis and face matching work end-to-end without a separate
backend.

## Production

`npm run build` — `dist/` is the static site, `api/*.ts` are picked up
verbatim by Vercel as serverless functions. Same handlers in dev and prod.

## Privacy notes

- Document image and selfie never leave the function memory.
- Only structured fields + numeric scores are logged.
- The `rawMRZ` array is stripped before forwarding the payload to HCS-U7.
- Document numbers are subject to GDPR — make sure your HCS-U7 tenant
  has a documented retention policy.

## Patents / origin

Cognitive engine: HCS-U7 (FR2514274 + FR2514546). This module is the
KYC front-door for HV-GUARD's identity-bound flows (WorkGuard
enrolment, PayGuard onboarding, etc.).
