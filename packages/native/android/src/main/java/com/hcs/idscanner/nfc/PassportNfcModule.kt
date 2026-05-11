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

    pendingPromise = promise
    pendingDocumentNumber = documentNumber
    pendingDateOfBirth = dateOfBirthYYMMDD
    pendingExpirationDate = expirationDateYYMMDD
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
        reject("DG_READ_FAILED", err.message ?: "Could not read passport chip.")
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

      val warnings = Arguments.createArray()
      tryReadPace(passportService, warnings)

      Log.i(TAG, "BAC start")
      try {
        passportService.doBAC(BACKey(documentNumber, dateOfBirthYYMMDD, expirationDateYYMMDD))
        Log.i(TAG, "BAC success")
      } catch (err: Throwable) {
        Log.w(TAG, "BAC failed")
        throw PassportReadException("BAC_FAILED", err.message ?: "BAC failed.")
      }

      val com = readCom(passportService)
      val dg1 = readDg1(passportService)
      val dg2FaceImageBase64 = readDg2FaceImage(passportService)
      val sod = readSod(passportService)
      warnings.pushString("Passive authentication not implemented yet")

      return Arguments.createMap().apply {
        putMap("com", com)
        putMap("dg1", dg1)
        putString("dg2FaceImageBase64", dg2FaceImageBase64)
        putMap("sod", sod)
        putBoolean(
          "chipMrzMatchesScannedMrz",
          normalizeDocumentNumber(dg1.getString("documentNumber")) == normalizeDocumentNumber(documentNumber),
        )
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
      Log.w(TAG, "COM read failed")
      throw PassportReadException("DG_READ_FAILED", err.message ?: "Could not read COM.")
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
      Log.w(TAG, "DG1 read failed")
      throw PassportReadException("DG_READ_FAILED", err.message ?: "Could not read DG1.")
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
      Log.w(TAG, "DG2 read failed")
      throw PassportReadException("DG_READ_FAILED", err.message ?: "Could not read DG2.")
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
      Log.w(TAG, "SOD read failed")
      throw PassportReadException("DG_READ_FAILED", err.message ?: "Could not read SOD.")
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
