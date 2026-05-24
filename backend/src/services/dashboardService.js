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

  async getStockReport(options = {}) {
    const page = Math.max(parseInt(options.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(options.limit, 10) || 10, 1), 100);
    const skip = (page - 1) * limit;
    const startDate = parseDateStart(options.startDate);
    const endDate = parseDateEnd(options.endDate);

    const [items, total] = await Promise.all([
      prisma.item.findMany({
        orderBy: { kode: 'asc' },
        skip,
        take: limit,
      }),
      prisma.item.count(),
    ]);

    const itemCodes = items.map((item) => item.kode);
    const periodWhere = buildDateWhere(startDate, endDate);
    const beforeStartWhere = startDate ? { date: { lt: startDate } } : null;

    const [periodTransactions, beforeTransactions] = await Promise.all([
      itemCodes.length
        ? prisma.transaction.groupBy({
            by: ['kode', 'type'],
            where: { kode: { in: itemCodes }, ...periodWhere },
            _sum: { jumlah: true },
          })
        : [],
      itemCodes.length && beforeStartWhere
        ? prisma.transaction.groupBy({
            by: ['kode', 'type'],
            where: { kode: { in: itemCodes }, ...beforeStartWhere },
            _sum: { jumlah: true },
          })
        : [],
    ]);

    const periodByKode = groupTransactionSums(periodTransactions);
    const beforeByKode = groupTransactionSums(beforeTransactions);

    const rows = items.map((item) => {
      const period = periodByKode.get(item.kode) || { masuk: 0, keluar: 0 };
      const before = beforeByKode.get(item.kode) || { masuk: 0, keluar: 0 };
      const stokAwal = before.masuk - before.keluar;
      const sisaStok = stokAwal + period.masuk - period.keluar;

      return {
        kode: item.kode,
        nama: item.nama,
        satuan: item.satuan,
        stokAwal,
        masuk: period.masuk,
        keluar: period.keluar,
        sisaStok,
      };
    });

    const totals = rows.reduce((acc, row) => {
      acc.stokAwal += row.stokAwal;
      acc.masuk += row.masuk;
      acc.keluar += row.keluar;
      acc.sisaStok += row.sisaStok;
      return acc;
    }, { stokAwal: 0, masuk: 0, keluar: 0, sisaStok: 0 });

    return {
      rows,
      totals,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      period: {
        startDate: startDate ? startDate.toISOString() : null,
        endDate: endDate ? endDate.toISOString() : null,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}

module.exports = new DashboardService();

function parseDateStart(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateEnd(value) {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildDateWhere(startDate, endDate) {
  if (!startDate && !endDate) return {};
  return {
    date: {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate ? { lte: endDate } : {}),
    },
  };
}

function groupTransactionSums(transactions) {
  const byKode = new Map();
  transactions.forEach((tx) => {
    if (!byKode.has(tx.kode)) byKode.set(tx.kode, { masuk: 0, keluar: 0 });
    byKode.get(tx.kode)[tx.type] = tx._sum.jumlah || 0;
  });
  return byKode;
}
