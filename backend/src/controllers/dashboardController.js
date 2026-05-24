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

  async getStockReport(req, res) {
    try {
      const report = await dashboardService.getStockReport({
        page: req.query.page,
        limit: req.query.limit,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      });
      res.json(report);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
}

module.exports = new DashboardController();
