module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android',
        packageImportPath: 'import com.hcs.idscanner.nfc.PassportNfcPackage;',
        packageInstance: 'new PassportNfcPackage()',
      },
    },
  },
};
