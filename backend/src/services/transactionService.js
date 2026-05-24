const prisma = require('../config/database');

class TransactionService {
  async getAllTransactions(options = {}) {
    const limit = options.limit;
    return prisma.transaction.findMany({
      orderBy: { id: 'desc' },
      ...(limit ? { take: limit } : {}),
    });
  }

  async createTransaction(data) {
    const jumlah = parseInt(data.jumlah, 10);

    if (!data.kode) throw new Error('Kode barang harus diisi');
    if (!['masuk', 'keluar'].includes(data.type)) throw new Error('Tipe transaksi tidak valid');
    if (!Number.isInteger(jumlah) || jumlah <= 0) throw new Error('Jumlah harus berupa angka lebih dari 0');
    if (!data.user) throw new Error('User transaksi harus diisi');

    const item = await prisma.item.findUnique({ where: { kode: data.kode } });
    if (!item) throw new Error('Barang tidak ditemukan');

    const user = await prisma.user.findUnique({ where: { username: data.user } });
    if (!user) throw new Error('User tidak ditemukan');

    return prisma.transaction.create({
      data: {
        kode: data.kode,
        type: data.type,
        jumlah,
        user: data.user,
        date: data.date ? new Date(data.date) : new Date(),
      },
    });
  }
}

module.exports = new TransactionService();
