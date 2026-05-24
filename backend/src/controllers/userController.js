const userService = require('../services/userService');

class UserController {
  async getAll(req, res) {
    try {
      const limit = parseLimit(req.query.limit);
      const users = await userService.getAllUsers({ limit });
      res.json(users);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }

  async create(req, res) {
    try {
      const user = await userService.createUser(req.body);
      res.json(user);
    } catch (e) {
      if (e.message.includes('sudah ada') || e.message.includes('harus diisi')) {
        return res.status(400).json({ error: e.message });
      }
      res.status(500).json({ error: e.message });
    }
  }

  async update(req, res) {
    const username = req.params.username;
    try {
      const result = await userService.updateUser(username, req.body);
      res.json(result);
    } catch (e) {
      if (e.message.includes('sudah digunakan') || e.message.includes('harus diisi')) {
        return res.status(400).json({ error: e.message });
      }
      res.status(500).json({ error: e.message });
    }
  }

  async delete(req, res) {
    const username = req.params.username;
    try {
      const result = await userService.deleteUser(username);
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

module.exports = new UserController();
