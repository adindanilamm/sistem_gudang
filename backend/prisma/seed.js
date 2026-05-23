// ================================================================
// Prisma Seed — StockFlow
// Jalankan: node prisma/seed.js
// ================================================================

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Memulai seed data...');

  // -----------------------------------------------
  // Seed Users (admin manager + 1 karyawan default)
  // -----------------------------------------------
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: 'admin',
      name: 'Administrator',
      role: 'manager',
    },
  });

  await prisma.user.upsert({
    where: { username: 'budi' },
    update: {},
    create: {
      username: 'budi',
      password: 'budi123',
      name: 'Budi Santoso',
      role: 'karyawan',
    },
  });

  // -----------------------------------------------
  // Seed Items (master data barang awal)
  // -----------------------------------------------
  await prisma.item.upsert({
    where: { kode: 'BRG001' },
    update: {},
    create: { kode: 'BRG001', nama: 'Beras Premium 5kg', satuan: 'Karung' },
  });

  await prisma.item.upsert({
    where: { kode: 'BRG002' },
    update: {},
    create: { kode: 'BRG002', nama: 'Minyak Goreng 1L', satuan: 'Botol' },
  });

  await prisma.item.upsert({
    where: { kode: 'BRG003' },
    update: {},
    create: { kode: 'BRG003', nama: 'Gula Pasir 1kg', satuan: 'Pcs' },
  });

  console.log('✅ Seed data berhasil!');
}

main()
  .catch((e) => {
    console.error('❌ Seed gagal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
