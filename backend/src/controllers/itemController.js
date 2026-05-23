const itemService = require('../services/itemService');

class ItemController {
  async getAll(req, res) {
    try {
      const items = await itemService.getAllItems();
      res.json(items);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }

  async create(req, res) {
    try {
      const item = await itemService.createItem(req.body);
      res.json(item);
    } catch (e) {
      if (e.message.includes('sudah terdaftar')) {
        return res.status(400).json({ error: e.message });
      }
      res.status(400).json({ error: e.message });
    }
  }

  async delete(req, res) {
    const kode = req.params.kode;
    try {
      const result = await itemService.deleteItem(kode);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
}

module.exports = new ItemController();
