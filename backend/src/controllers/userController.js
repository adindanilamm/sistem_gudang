const userService = require('../services/userService');

class UserController {
  async getAll(req, res) {
    try {
      const users = await userService.getAllUsers();
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

module.exports = new UserController();
