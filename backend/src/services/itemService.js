const prisma = require('../config/database');

class ItemService {
  async getAllItems() {
    return prisma.item.findMany({ orderBy: { kode: 'asc' } });
  }

  async createItem(data) {
    if (!data.kode || !String(data.kode).trim()) throw new Error('Kode barang harus diisi');
    if (!data.nama || !String(data.nama).trim()) throw new Error('Nama barang harus diisi');
    if (!data.satuan || !String(data.satuan).trim()) throw new Error('Satuan barang harus diisi');

    try {
      return await prisma.item.create({
        data: {
          kode: String(data.kode).trim(),
          nama: String(data.nama).trim(),
          satuan: String(data.satuan).trim(),
        },
      });
    } catch (e) {
      if (e.code === 'P2002') throw new Error('Kode barang sudah terdaftar');
      throw e;
    }
  }

  async deleteItem(kode) {
    await prisma.item.delete({ where: { kode } });
    return { success: true };
  }
}

module.exports = new ItemService();
