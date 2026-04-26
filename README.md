# HCS ID Scanner — monorepo

Open-source KYC identity verification — **MRZ + face match + optional
NFC chip read**. No external identity-provider redirect, no per-call
licence cost (only AWS Rekognition CompareFaces ≈ $0.001/verif).

```
hcs-id-scanner/
├─ packages/
│  ├─ core/     ← @hcs/id-scanner-core    (analyzeMRZ, compareFaces, types)
│  ├─ react/    ← @hcs/id-scanner-react   (web/PWA components + hook)
│  └─ native/   ← @hcs/id-scanner-native  (RN — VisionCamera + NFC)
├─ apps/
│  └─ demo-web/ ← Vite reference app (deployed at hcsidscanner.vercel.app)
├─ codemagic.yaml
└─ vercel.json
```

## Quick start

```bash
npm install --include=dev --legacy-peer-deps
npm run dev          # apps/demo-web on http://localhost:5173
```

You'll need AWS Rekognition credentials in `apps/demo-web/.env.local`:

```
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=eu-west-1
VITE_HCS_API_URL=https://hcs-u7-backend-kk0n.onrender.com
VITE_HCS_TENANT_ID=hcs-id-scanner-demo
```

## Build & type-check

```bash
npm run type-check       # type-check all 3 packages + demo-web
npm run build            # build the demo-web bundle (deployed by Vercel)
```

The 3 packages are **source-only** (no `dist/` build step needed) —
their `package.json` `main` points directly at `./src/index.ts`. This
keeps integration ergonomic in monorepos and `file:` consumers.

## Package: `@hcs/id-scanner-core`

Pure TS — Node-only at runtime (`mrz-detection`, `image-js`, AWS SDK).

```ts
import { analyzeMRZ, compareFaces, computeKycScore } from '@hcs/id-scanner-core';

const doc = await analyzeMRZ(imageBase64);
const verdict = await compareFaces(selfieBase64, docBase64);
const score = computeKycScore({
  mrzValid: doc.checkDigitsValid,
  documentExpired: doc.isExpired,
  faceSimilarity: verdict.similarity,
});
```

## Package: `@hcs/id-scanner-react`

Drop-in component for any React 18+ app:

```tsx
import { IDVerificationFlow } from '@hcs/id-scanner-react';

<IDVerificationFlow
  config={{
    tenantId,
    employeeId,
    minFaceMatchScore: 80,
    requireFaceMatch: true,
    hcsApiUrl: process.env.HCS_API_URL,
  }}
  onComplete={(result) => {
    if (result.kycScore >= 0.7) continueOnboarding(result);
  }}
  onError={(code) => toast.error(code)}
/>
```

The component drives its own internal state (zustand). It expects two
backend endpoints (`/api/analyze-mrz`, `/api/face-match`) — see
`apps/demo-web/api/*.ts` for a Vercel-style reference implementation.

## Package: `@hcs/id-scanner-native`

React Native components — VisionCamera live MRZ detection + NFC chip
read.

```tsx
import { IDVerificationFlowNative } from '@hcs/id-scanner-native';

<IDVerificationFlowNative
  config={{ tenantId, minFaceMatchScore: 80 }}
  endpoints={{
    analyzeMrz: 'https://api.example.com/api/analyze-mrz',
    faceMatch:  'https://api.example.com/api/face-match',
  }}
  enableNfc={true}
  onComplete={(r) => navigation.replace('Onboarding', { kyc: r })}
  onError={(c) => Alert.alert('KYC failed', c)}
/>
```

Peer deps (the host app must install them):
- `react-native-vision-camera` ≥ 4
- `vision-camera-mrz-scanner` ≥ 2
- `react-native-nfc-manager` ≥ 3

## Integrating in HV-GUARD modules

### WorkGuard (web)

```jsonc
// workguard-web/package.json
{
  "dependencies": {
    "@hcs/id-scanner-react": "file:../../hcs-id-scanner/packages/react"
  }
}
```

```tsx
// workguard-web/src/onboarding/EnrolKyc.tsx
import { IDVerificationFlow } from '@hcs/id-scanner-react';
// …
```

### WorkGuard (React Native)

```jsonc
// workguard-rn/package.json
{
  "dependencies": {
    "@hcs/id-scanner-native": "file:../../hcs-id-scanner/packages/native"
  }
}
```

```tsx
// workguard-rn/src/screens/EnrolKycScreen.tsx
import { IDVerificationFlowNative } from '@hcs/id-scanner-native';
// …
```

### PayGuard / AccessGuard / SignGuard / EdGuard

Same pattern — pick `@hcs/id-scanner-react` for the web dashboards and
`@hcs/id-scanner-native` for the mobile companion apps. Each module
forwards its own `tenantId` and `employeeId` (when applicable) so the
verdict can be persisted under the right HCS-U7 record.

## CI/CD

- **Vercel** — pushes to `main` build `apps/demo-web` (see
  `vercel.json`). Set the AWS keys in **Settings → Environment
  Variables** before pushing.
- **Codemagic** — `codemagic.yaml` defines `android` (Linux runner) and
  `ios` (Mac M2 runner) workflows that produce a signed APK / IPA.
  Trigger from the Codemagic UI; no local Mac required.

## Privacy & security

- Document and selfie bytes never leave the function memory.
- AWS keys are server-only; never prefixed `VITE_`.
- `rawMRZ` is stripped from the payload posted to HCS-U7.
- Document numbers are subject to GDPR — make sure your tenant has a
  documented retention policy.

## Patents / origin

Cognitive engine: HCS-U7 (FR2514274 + FR2514546). This module is the
KYC front-door for HV-GUARD's identity-bound flows.
