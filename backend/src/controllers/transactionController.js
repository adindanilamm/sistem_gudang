const transactionService = require('../services/transactionService');

class TransactionController {
  async getAll(req, res) {
    try {
      const txns = await transactionService.getAllTransactions();
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
}

module.exports = new TransactionController();
