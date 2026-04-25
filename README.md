# HCS ID Scanner

KYC identity verification module — Signicat eID Hub (NFC + MRZ + chip
crypto) + AWS Rekognition face match. Web app (Vite + React + TS), wrapped
on Android with Capacitor.

> Replaces the previous ReadID + AWS Textract `AnalyzeID` pipeline with a
> single Signicat-driven flow that handles MRZ, NFC ICAO 9303 chip read,
> and cryptographic verification of the issuing country's signature.

## Architecture

```
┌──────────────┐  authorize  ┌──────────────────┐  callback  ┌──────────────┐
│ Start screen │ ──────────▶ │ Signicat hosted  │ ─────────▶ │ Callback     │
│ (Étape 1)    │             │ MRZ + NFC + sig  │            │ (Étape 2)    │
└──────────────┘             └──────────────────┘            └──────┬───────┘
                                                                    │
                                                                    ▼
                                                       POST /api/token-exchange
                                                       (server-only client_secret)
                                                                    │
                                                                    ▼
                                                              SignicatClaims
                                                                    │
┌──────────────┐  selfie     ┌──────────────────┐                   │
│ Face match   │ ──────────▶ │ POST /api/       │                   │
│ (Étape 3)    │             │ face-match       │ ◀─────────────────┘
└──────┬───────┘             │ AWS Rekognition  │
       │                     └──────────────────┘
       │
       ▼
┌──────────────┐
│ Result       │  POST VITE_HCS_API_URL/api/kyc/register
│ (Étape 4)    │
└──────────────┘
```

## Stack

| Layer            | Choice                                           |
| ---------------- | ------------------------------------------------ |
| Framework        | React 19 + Vite 8 + TypeScript                   |
| State            | zustand (single store: `useIDVerification`)      |
| Routing          | react-router-dom v7                              |
| OIDC             | Authorization Code + PKCE (S256), client crafted |
| Camera           | react-webcam (web) — Capacitor Browser (native)  |
| Face match       | `@aws-sdk/client-rekognition` CompareFaces       |
| Native shell     | Capacitor 7 (Android, iOS optional)              |
| Server-side proxy| Vite middleware (dev) → Vercel functions (prod)  |

## Project layout

```
hcs-id-scanner/
├─ api/
│  ├─ _helpers.ts              ← shared http helpers (Vercel-style shape)
│  ├─ token-exchange.ts        ← POST /api/token-exchange
│  └─ face-match.ts            ← POST /api/face-match
├─ src/
│  ├─ components/
│  │  ├─ IDVerificationStart.tsx
│  │  ├─ CallbackHandler.tsx
│  │  ├─ FaceMatch.tsx
│  │  ├─ IDVerificationResult.tsx
│  │  └─ Stepper.tsx
│  ├─ hooks/
│  │  └─ useIDVerification.ts  ← zustand store + apiPost helper
│  ├─ lib/
│  │  ├─ signicat.ts           ← OIDC PKCE + authorize URL builder
│  │  └─ theme.ts              ← HCS-U7 dark theme tokens
│  ├─ types.ts                 ← shared types (claims, steps, etc.)
│  ├─ App.tsx                  ← router + shell + stepper
│  └─ main.tsx
├─ vite-plugin-api.ts          ← dev-only middleware that mounts /api/*
├─ vite.config.ts
├─ capacitor.config.ts
└─ .env.example
```

## Getting started

### 1. Install

```bash
npm install
cp .env.example .env
# Fill SIGNICAT_CLIENT_SECRET, AWS keys, etc. (see Security below).
```

### 2. Dev server

```bash
npm run dev
# Open http://localhost:5173
```

The Vite dev server mounts the `api/*` handlers in-process, so the OIDC
token exchange and the face-match call work end-to-end without a separate
backend.

### 3. Production build

```bash
npm run build
npm run preview
```

In production the `api/` folder deploys verbatim as Vercel serverless
functions (or any compatible runtime) — same handler shape.

### 4. Android shell

```bash
npx cap init "HCS ID Scanner" com.iasolution.hcsidscanner
npx cap add android
npx cap sync android
npx cap open android
```

After the first `cap add android`, edit
`android/app/src/main/AndroidManifest.xml` to add:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.NFC" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-feature android:name="android.hardware.nfc" android:required="false" />
```

Set `minSdkVersion 26` in `android/variables.gradle`.

The OIDC flow opens via `@capacitor/browser` (Custom Chrome Tab) — never
in an in-app WebView (Signicat refuses WebViews).

## API contract

### `POST /api/token-exchange`

| Field           | Type   | Notes                              |
| --------------- | ------ | ---------------------------------- |
| `code`          | string | from the Signicat redirect         |
| `redirect_uri`  | string | must match the authorize call      |
| `code_verifier` | string | the PKCE verifier kept client-side |

Returns `{ claims: SignicatClaims }`. The raw `access_token` is **never**
returned to the client. The whitelist of forwarded claims lives in
`api/token-exchange.ts → ALLOWED_CLAIM_KEYS`.

### `POST /api/face-match`

| Field                | Type   |
| -------------------- | ------ |
| `sourceImageBase64`  | string |
| `targetImageBase64`  | string |

Returns `{ similarity, confidence, isMatch, threshold }`. Threshold is
hard-coded server-side at 90% (Signicat-grade). The two images are not
logged anywhere — only the numeric verdict is.

## Security

- `SIGNICAT_CLIENT_SECRET` lives **only** as a non-`VITE_*` env var; the
  Vite bundler refuses to ship it into the client bundle.
- Token exchange happens server-side; the client only ever receives a
  curated claims subset.
- The portrait (chip DG2) is forwarded to Rekognition for the match,
  then dropped before the HCS-U7 registration call.
- All Signicat error codes are mapped to generic user-facing messages
  (no leak of upstream IdP details).

## Environment variables

See `.env.example`. The two namespaces:

- `VITE_*` — embedded in the bundle, public.
- everything else — server-only, available to `api/*` handlers.

## Verification flow — error handling

| Situation                  | Behaviour                              |
| -------------------------- | -------------------------------------- |
| User cancels on Signicat   | redirect `?error=…` → back to Étape 1  |
| Document expired           | Signicat refuses; we surface the error |
| Face match < 90%, ≥ 70%    | retry allowed, soft warning            |
| Face match < 70%           | hard fail, must restart                |
| NFC unsupported on device  | Signicat falls back to OCR             |
| Network error              | retry button on each step              |

## Patents / origin

Cognitive engine: HCS-U7 (FR2514274 + FR2514546).
This module is the KYC front-door for HV-GUARD's identity-bound flows
(WorkGuard enrolment, PayGuard onboarding, etc.).
