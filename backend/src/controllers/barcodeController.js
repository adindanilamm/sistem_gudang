const bwipjs = require('bwip-js');

class BarcodeController {
  async generateBarcode(req, res) {
    const kode = req.params.kode;
    try {
      bwipjs.request(req, res, {
        bcid: 'code128',       // Tipe Barcode
        text: kode,            // Teks yang akan di-encode
        scale: 3,              // Skala gambar (3x default)
        height: 10,            // Tinggi bar (dalam mm)
        includetext: true,     // Tampilkan teks di bawah barcode
        textxalign: 'center',  // Teks di tengah
      });
    } catch (e) {
      res.status(500).json({ error: 'Gagal membuat barcode' });
    }
  }
}

module.exports = new BarcodeController();
