const dashboardService = require('../services/dashboardService');

class DashboardController {
  async getStats(req, res) {
    try {
      const stats = await dashboardService.getSummaryStats();
      res.json(stats);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }

  async getStockStats(req, res) {
    try {
      const stats = await dashboardService.getStockStats();
      res.json(stats);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
}

module.exports = new DashboardController();
