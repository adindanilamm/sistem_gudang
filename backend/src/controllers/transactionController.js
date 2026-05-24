const transactionService = require('../services/transactionService');

class TransactionController {
  async getAll(req, res) {
    try {
      const limit = parseLimit(req.query.limit);
      const txns = await transactionService.getAllTransactions({ limit });
      res.json(txns);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }

  async create(req, res) {
    try {
      const txn = await transactionService.createTransaction(req.body);
      res.json(txn);
    } catch (e) {
      if (
        e.message.includes('harus') ||
        e.message.includes('tidak valid') ||
        e.message.includes('tidak ditemukan')
      ) {
        return res.status(400).json({ error: e.message });
      }
      res.status(500).json({ error: e.message });
    }
  }

  async getStock(req, res) {
    try {
      const stock = await transactionService.getStockByKode(req.params.kode);
      res.json(stock);
    } catch (e) {
      if (e.message.includes('harus') || e.message.includes('tidak ditemukan')) {
        return res.status(400).json({ error: e.message });
      }
      res.status(500).json({ error: e.message });
    }
  }
}

function parseLimit(value) {
  const limit = parseInt(value, 10);
  if (!Number.isInteger(limit) || limit <= 0) return undefined;
  return Math.min(limit, 100);
}

module.exports = new TransactionController();
