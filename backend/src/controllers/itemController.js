const itemService = require('../services/itemService');

class ItemController {
  async getAll(req, res) {
    try {
      const limit = parseLimit(req.query.limit);
      const page = parsePage(req.query.page);
      const items = await itemService.getAllItems({ limit, page });

      if (limit || req.query.page) {
        const total = await itemService.countItems();
        return res.json({
          data: items,
          page,
          limit: limit || total,
          total,
          totalPages: limit ? Math.max(1, Math.ceil(total / limit)) : 1,
        });
      }

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

function parseLimit(value) {
  const limit = parseInt(value, 10);
  if (!Number.isInteger(limit) || limit <= 0) return undefined;
  return Math.min(limit, 100);
}

function parsePage(value) {
  const page = parseInt(value, 10);
  if (!Number.isInteger(page) || page <= 0) return 1;
  return page;
}

module.exports = new ItemController();
