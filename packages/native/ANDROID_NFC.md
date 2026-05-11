# Android ePassport NFC integration

`@hcs/id-scanner-native` includes an Android native module named `HcsPassportNfc` for reading ICAO 9303 ePassport chips through NFC `IsoDep`.

## Required Android permissions

Add the following to the host app `AndroidManifest.xml` if it is not merged automatically from the library:

```xml
<uses-permission android:name="android.permission.NFC" />
<uses-feature android:name="android.hardware.nfc" android:required="false" />
```

## Android requirements

- Physical Android device with NFC enabled.
- Real biometric passport or eMRTD test card.
- `minSdk` 24 or higher when used with React Native 0.76+.
- NFC cannot be tested on an emulator.

## Gradle dependencies

The native package declares:

```gradle
implementation "org.jmrtd:jmrtd:0.7.42"
implementation "net.sf.scuba:scuba-smartcards:0.0.20"
```

If your host app overrides dependency resolution, ensure compatible JMRTD and Scuba versions are available from `mavenCentral()`.

## Validated demo Android build

This repository includes a minimal React Native Android host app:

```txt
apps/demo-native/
```

Install workspace dependencies:

```bash
npm install
```

Validate autolinking:

```bash
cd apps/demo-native
npx react-native config
```

The output must include:

```txt
@hcs/id-scanner-native
packageImportPath: import com.hcs.idscanner.nfc.PassportNfcPackage;
packageInstance: new PassportNfcPackage()
```

Build Android:

```bash
cd apps/demo-native/android
./gradlew clean assembleDebug
```

On Windows:

```powershell
cd apps/demo-native/android
.\gradlew.bat clean assembleDebug
```

Validated locally with:

```txt
BUILD SUCCESSFUL
```

## Android Gradle notes

The demo app uses:

```txt
React Native 0.76.9
Android Gradle Plugin 8.6.1
Gradle 8.10.2
Kotlin 1.9.24
compileSdk 35
minSdk 24
```

The app excludes duplicated BouncyCastle/JMRTD metadata resources:

```gradle
packagingOptions {
  resources {
    excludes += [
      "META-INF/DEPENDENCIES",
      "META-INF/LICENSE",
      "META-INF/LICENSE.txt",
      "META-INF/NOTICE",
      "META-INF/NOTICE.txt",
      "META-INF/ASL2.0",
      "META-INF/*.kotlin_module",
      "META-INF/versions/**",
      "META-INF/OSGI-INF/**",
      "OSGI-INF/**"
    ]
  }
}
```

## Native module registration

The Android package class is:

```kotlin
com.hcs.idscanner.nfc.PassportNfcPackage
```

React Native autolinking should discover the package through the package `android` source directory. If your app disables autolinking, manually add `PassportNfcPackage()` to your `MainApplication` package list.

## Runtime flow

The JS flow derives BAC inputs from the MRZ scan:

```txt
documentNumber
dateOfBirth YYMMDD
expirationDate YYMMDD
```

Then it calls:

```ts
NativeModules.HcsPassportNfc.readPassport(documentNumber, dateOfBirthYYMMDD, expirationDateYYMMDD)
```

The Android module:

1. Enables NFC reader mode.
2. Waits for an `IsoDep` tag.
3. Opens a JMRTD `PassportService` over Scuba `CardService`.
4. Performs BAC.
5. Reads COM, DG1, DG2, and SOD.
6. Returns DG1 fields, the first DG2 face image as a data URL, SOD metadata, and warnings.

## BAC and PACE limits

BAC is implemented first. The module detects `EF_CARD_ACCESS` and returns a warning when PACE data is present, but PACE is not completed yet.

Some modern passports may require PACE before BAC. Those documents may fail with `BAC_FAILED` or `DG_READ_FAILED` until PACE is implemented.

## Passive Authentication

SOD is read and digest metadata is returned, but certificate chain validation/passive authentication is not completed yet. The result includes:

```ts
passiveAuthenticationPassed: undefined
warnings: ["Passive authentication not implemented yet"]
```

## Privacy and logging

Do not log NFC payloads, DG1, DG2, SOD, MRZ keys, or face images in production. Passport chip data is sensitive PII/biometric data and should only be held in memory for the KYC session.

The Android module only logs safe events:

- session start
- tag callback received
- BAC start/success/fail
- COM/DG1/DG2/SOD read success/fail

It must not log:

- full MRZ
- full document number
- date of birth
- expiration date
- DG1 payload
- DG2 image/base64
- SOD payload

## Demo bridge screen

`apps/demo-native/src/App.tsx` includes a development-only `Test NFC bridge` button that calls:

```ts
NativeModules.HcsPassportNfc.readPassport(
  documentNumber,
  dateOfBirthYYMMDD,
  expirationDateYYMMDD,
)
```

Use only test MRZ values or a controlled QA passport. Do not screenshot or log production passport data.

## Manual validation

On a physical Android NFC device:

1. Scan MRZ successfully.
2. Continue to `Read passport chip`.
3. Place the top/back of the phone on the passport chip.
4. Keep the passport still until BAC and DG reads complete.
5. Confirm DG1 is read and matches the scanned MRZ.
6. Confirm DG2 face image is available when the passport exposes it.
7. Continue to selfie.
