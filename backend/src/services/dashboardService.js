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

  async getStockStats() {
    const [items, transactions] = await Promise.all([
      prisma.item.findMany({
        select: { kode: true, satuan: true },
      }),
      prisma.transaction.groupBy({
        by: ['kode', 'type'],
        _sum: { jumlah: true },
      }),
    ]);

    const txByKode = new Map();
    transactions.forEach((tx) => {
      if (!txByKode.has(tx.kode)) txByKode.set(tx.kode, { masuk: 0, keluar: 0 });
      txByKode.get(tx.kode)[tx.type] = tx._sum.jumlah || 0;
    });

    const lowStockThreshold = 10;
    let lowStockCount = 0;
    let emptyStockCount = 0;
    items.forEach((item) => {
      const totals = txByKode.get(item.kode) || { masuk: 0, keluar: 0 };
      const stok = totals.masuk - totals.keluar;
      if (stok <= lowStockThreshold) lowStockCount += 1;
      if (stok <= 0) emptyStockCount += 1;
    });

    return {
      totalSku: items.length,
      lowStockCount,
      emptyStockCount,
      activeUnitCount: new Set(items.map((item) => item.satuan).filter(Boolean)).size,
      lowStockThreshold,
    };
  }
}

module.exports = new DashboardService();
