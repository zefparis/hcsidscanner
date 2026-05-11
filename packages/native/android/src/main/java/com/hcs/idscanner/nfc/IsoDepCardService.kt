package com.hcs.idscanner.nfc

import android.nfc.tech.IsoDep
import net.sf.scuba.smartcards.CardService
import net.sf.scuba.smartcards.CommandAPDU
import net.sf.scuba.smartcards.ResponseAPDU

class IsoDepCardService(
  private val isoDep: IsoDep,
) : CardService() {
  override fun open() {
    if (!isoDep.isConnected) {
      isoDep.connect()
    }
  }

  override fun close() {
    if (isoDep.isConnected) {
      isoDep.close()
    }
  }

  override fun isOpen(): Boolean = isoDep.isConnected

  override fun getATR(): ByteArray = ByteArray(0)

  override fun isConnectionLost(exception: Exception): Boolean = !isoDep.isConnected

  override fun transmit(commandAPDU: CommandAPDU): ResponseAPDU {
    return ResponseAPDU(isoDep.transceive(commandAPDU.bytes))
  }
}
