const prisma = require('../config/database');

class DashboardService {
  async getSummaryStats() {
    // Menghitung statistik langsung di sisi server (MySQL)
    
    // 1. Total Jenis Barang
    const totalJenisBarang = await prisma.item.count();
    
    // 2. Aggregate Transaksi Masuk dan Keluar
    const transactions = await prisma.transaction.groupBy({
      by: ['type'],
      _sum: {
        jumlah: true,
      },
    });

    let totalMasuk = 0;
    let totalKeluar = 0;

    transactions.forEach((tx) => {
      if (tx.type === 'masuk') totalMasuk = tx._sum.jumlah || 0;
      if (tx.type === 'keluar') totalKeluar = tx._sum.jumlah || 0;
    });

    // 3. Kalkulasi Total Stok
    const totalStok = totalMasuk - totalKeluar;

    return {
      totalJenisBarang,
      totalStok,
      totalMasuk,
      totalKeluar,
    };
  }
}

module.exports = new DashboardService();
