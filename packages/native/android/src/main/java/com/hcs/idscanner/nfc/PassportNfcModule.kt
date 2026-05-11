package com.hcs.idscanner.nfc

import android.app.Activity
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.IsoDep
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import org.jmrtd.BACKey
import org.jmrtd.PassportService
import org.jmrtd.lds.CardAccessFile
import org.jmrtd.lds.SODFile
import org.jmrtd.lds.icao.COMFile
import org.jmrtd.lds.icao.DG1File
import org.jmrtd.lds.icao.DG2File
import org.jmrtd.lds.iso19794.FaceImageInfo
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.util.concurrent.atomic.AtomicBoolean

class PassportNfcModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private companion object {
    private const val TAG = "HcsPassportNfc"
  }

  private var pendingPromise: Promise? = null
  private var pendingDocumentNumber: String? = null
  private var pendingDateOfBirth: String? = null
  private var pendingExpirationDate: String? = null
  private val reading = AtomicBoolean(false)

  override fun getName(): String = "HcsPassportNfc"

  @ReactMethod
  fun readPassport(
    documentNumber: String,
    dateOfBirthYYMMDD: String,
    expirationDateYYMMDD: String,
    promise: Promise,
  ) {
    val activity = currentActivity
    if (activity == null) {
      promise.reject("NFC_NOT_SUPPORTED", "No Android activity is available.")
      return
    }

    val adapter = NfcAdapter.getDefaultAdapter(activity)
    if (adapter == null) {
      promise.reject("NFC_NOT_SUPPORTED", "This device does not support NFC.")
      return
    }

    if (!adapter.isEnabled) {
      promise.reject("NFC_DISABLED", "NFC is disabled.")
      return
    }

    if (!reading.compareAndSet(false, true)) {
      promise.reject("PASSPORT_NOT_DETECTED", "An NFC passport read is already in progress.")
      return
    }

    val cleanDoc = documentNumber.replace("[^A-Za-z0-9<]".toRegex(), "").uppercase()
    val cleanDob = dateOfBirthYYMMDD.replace("[^0-9]".toRegex(), "").take(6)
    val cleanDoe = expirationDateYYMMDD.replace("[^0-9]".toRegex(), "").take(6)

    Log.i(TAG, "readPassport called: doc='$cleanDoc' (${cleanDoc.length}), dob='$cleanDob' (${cleanDob.length}), doe='$cleanDoe' (${cleanDoe.length})")

    if (cleanDoc.isEmpty() || cleanDob.length != 6 || cleanDoe.length != 6) {
      reading.set(false)
      promise.reject("BAC_FAILED", "Invalid BAC keys: document='$cleanDoc', dob='$cleanDob', doe='$cleanDoe'. Dates must be 6 digits (YYMMDD).")
      return
    }

    pendingPromise = promise
    pendingDocumentNumber = cleanDoc
    pendingDateOfBirth = cleanDob
    pendingExpirationDate = cleanDoe
    Log.i(TAG, "NFC passport reader session started")

    activity.runOnUiThread {
      adapter.enableReaderMode(
        activity,
        { tag -> handleTag(activity, adapter, tag) },
        NfcAdapter.FLAG_READER_NFC_A or
          NfcAdapter.FLAG_READER_NFC_B or
          NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK,
        null,
      )
    }
  }

  private fun handleTag(activity: Activity, adapter: NfcAdapter, tag: Tag) {
    Log.i(TAG, "IsoDep-compatible NFC tag callback received")
    if (!reading.get()) {
      Log.w(TAG, "Ignoring tag callback - no read in progress (already completed or cancelled)")
      return
    }
    Thread {
      try {
        val documentNumber = pendingDocumentNumber ?: throw PassportReadException(
          "BAC_FAILED",
          "Missing document number.",
        )
        val dateOfBirth = pendingDateOfBirth ?: throw PassportReadException(
          "BAC_FAILED",
          "Missing date of birth.",
        )
        val expirationDate = pendingExpirationDate ?: throw PassportReadException(
          "BAC_FAILED",
          "Missing expiration date.",
        )
        val result = readTag(tag, documentNumber, dateOfBirth, expirationDate)
        resolve(result)
      } catch (err: PassportReadException) {
        reject(err.code, err.message ?: err.code)
      } catch (err: Throwable) {
        Log.e(TAG, "Unexpected exception: ${err.javaClass.simpleName}: ${err.message}", err)
        reject("DG_READ_FAILED", "${err.javaClass.simpleName}: ${err.message ?: "Unexpected exception"}")
      } finally {
        activity.runOnUiThread { adapter.disableReaderMode(activity) }
        clearState()
      }
    }.start()
  }

  private fun readTag(
    tag: Tag,
    documentNumber: String,
    dateOfBirthYYMMDD: String,
    expirationDateYYMMDD: String,
  ): WritableMap {
    val isoDep = IsoDep.get(tag) ?: throw PassportReadException(
      "PASSPORT_NOT_DETECTED",
      "Detected NFC tag is not IsoDep compatible.",
    )
    isoDep.timeout = 120_000
    isoDep.connect()

    try {
      Log.i(TAG, "Opening IsoDep passport card service")
      val cardService = IsoDepCardService(isoDep)
      cardService.open()
      val passportService = PassportService(
        cardService,
        PassportService.NORMAL_MAX_TRANCEIVE_LENGTH,
        PassportService.DEFAULT_MAX_BLOCKSIZE,
        false,
        false,
      )
      passportService.open()
      passportService.sendSelectApplet(false)

      val warnings = Arguments.createArray()
      tryReadPace(passportService, warnings)

      Log.i(TAG, "BAC start with doc='$documentNumber', dob='$dateOfBirthYYMMDD', doe='$expirationDateYYMMDD'")
      try {
        passportService.doBAC(BACKey(documentNumber, dateOfBirthYYMMDD, expirationDateYYMMDD))
        Log.i(TAG, "BAC success")
      } catch (err: Throwable) {
        Log.w(TAG, "BAC failed: ${err.message}")
        throw PassportReadException("BAC_FAILED", "BAC failed in ${err.message ?: "unknown"} (step: doBAC)")
      }

      Log.i(TAG, "Reading COM...")
      val com = readCom(passportService)
      Log.i(TAG, "Reading DG1...")
      val dg1 = readDg1(passportService)
      Log.i(TAG, "Reading SOD...")
      val sod = readSod(passportService)

      Log.i(TAG, "Reading DG2 (face image)...")
      var dg2FaceImageBase64: String? = null
      try {
        dg2FaceImageBase64 = readDg2FaceImage(passportService)
      } catch (err: Throwable) {
        Log.w(TAG, "DG2 face image read failed (non-fatal): ${err.javaClass.simpleName}: ${err.message}")
        warnings.pushString("Face image could not be read: ${err.javaClass.simpleName}")
      }

      warnings.pushString("Passive authentication not implemented yet")

      val chipDocNum = dg1.getString("documentNumber")
      val chipMrzMatches = normalizeDocumentNumber(chipDocNum) == normalizeDocumentNumber(documentNumber)

      return Arguments.createMap().apply {
        putMap("com", com)
        putMap("dg1", dg1)
        if (dg2FaceImageBase64 != null) putString("dg2FaceImageBase64", dg2FaceImageBase64) else putNull("dg2FaceImageBase64")
        putMap("sod", sod)
        putBoolean("chipMrzMatchesScannedMrz", chipMrzMatches)
        putNull("passiveAuthenticationPassed")
        putArray("warnings", warnings)
      }
    } finally {
      try {
        isoDep.close()
      } catch (_: Throwable) {
      }
    }
  }

  private fun tryReadPace(passportService: PassportService, warnings: com.facebook.react.bridge.WritableArray) {
    try {
      val cardAccessInput = passportService.getInputStream(PassportService.EF_CARD_ACCESS)
      CardAccessFile(cardAccessInput)
      warnings.pushString("PACE data present, but PACE is not implemented yet; BAC was used")
    } catch (_: Throwable) {
    }
  }

  private fun readCom(passportService: PassportService): WritableMap {
    return try {
      val file = COMFile(passportService.getInputStream(PassportService.EF_COM))
      Log.i(TAG, "COM read success")
      Arguments.createMap().apply {
        putString("ldsVersion", file.ldsVersion)
        putString("unicodeVersion", file.unicodeVersion)
        putArray("dataGroups", Arguments.createArray().apply {
          file.tagList.forEach { pushInt(it) }
        })
      }
    } catch (err: Throwable) {
      Log.w(TAG, "COM read failed: ${err.javaClass.simpleName}: ${err.message}", err)
      throw PassportReadException("DG_READ_FAILED", "COM: ${err.javaClass.simpleName}: ${err.message}")
    }
  }

  private fun readDg1(passportService: PassportService): WritableMap {
    return try {
      val file = DG1File(passportService.getInputStream(PassportService.EF_DG1))
      val info = file.mrzInfo
      Log.i(TAG, "DG1 read success")
      Arguments.createMap().apply {
        putString("documentNumber", info.documentNumber)
        putString("dateOfBirth", info.dateOfBirth)
        putString("expirationDate", info.dateOfExpiry)
        putString("firstName", info.secondaryIdentifier.replace("<", " ").trim())
        putString("lastName", info.primaryIdentifier.replace("<", " ").trim())
        putString("nationality", info.nationality)
        putString("issuingCountry", info.issuingState)
        putString("sex", info.gender.toString())
      }
    } catch (err: Throwable) {
      Log.w(TAG, "DG1 read failed: ${err.javaClass.simpleName}: ${err.message}", err)
      throw PassportReadException("DG_READ_FAILED", "DG1: ${err.javaClass.simpleName}: ${err.message}")
    }
  }

  private fun readDg2FaceImage(passportService: PassportService): String? {
    return try {
      val file = DG2File(passportService.getInputStream(PassportService.EF_DG2))
      val faceImageInfo = file.faceInfos
        .flatMap { it.faceImageInfos }
        .firstOrNull() ?: return null
      val bytes = readFaceImageBytes(faceImageInfo)
      val mimeType = faceImageInfo.mimeType ?: "image/jpeg"
      Log.i(TAG, "DG2 read success")
      "data:$mimeType;base64,${Base64.encodeToString(bytes, Base64.NO_WRAP)}"
    } catch (err: Throwable) {
      Log.w(TAG, "DG2 read failed: ${err.javaClass.simpleName}: ${err.message}", err)
      throw err
    }
  }

  private fun readSod(passportService: PassportService): WritableMap {
    return try {
      val file = SODFile(passportService.getInputStream(PassportService.EF_SOD))
      Log.i(TAG, "SOD read success")
      Arguments.createMap().apply {
        putString("digestAlgorithm", file.digestAlgorithm)
        putString("digestEncryptionAlgorithm", file.digestEncryptionAlgorithm)
        putArray("dataGroupHashes", Arguments.createArray().apply {
          file.dataGroupHashes.keys.sorted().forEach { pushInt(it) }
        })
      }
    } catch (err: Throwable) {
      Log.w(TAG, "SOD read failed: ${err.javaClass.simpleName}: ${err.message}", err)
      throw PassportReadException("DG_READ_FAILED", "SOD: ${err.javaClass.simpleName}: ${err.message}")
    }
  }

  private fun readFaceImageBytes(faceImageInfo: FaceImageInfo): ByteArray {
    return readFully(faceImageInfo.imageInputStream)
  }

  private fun readFully(inputStream: InputStream): ByteArray {
    val output = ByteArrayOutputStream()
    val buffer = ByteArray(8192)
    while (true) {
      val read = inputStream.read(buffer)
      if (read < 0) break
      output.write(buffer, 0, read)
    }
    return output.toByteArray()
  }

  private fun normalizeDocumentNumber(value: String?): String {
    return value.orEmpty().replace("<", "").trim()
  }

  private fun resolve(result: WritableMap) {
    pendingPromise?.resolve(result)
  }

  private fun reject(code: String, message: String) {
    pendingPromise?.reject(code, message)
  }

  private fun clearState() {
    reading.set(false)
    pendingPromise = null
    pendingDocumentNumber = null
    pendingDateOfBirth = null
    pendingExpirationDate = null
  }

  private class PassportReadException(
    val code: String,
    override val message: String,
  ) : Exception(message)
}
