const authService = require('../services/authService');

class AuthController {
  async login(req, res) {
    const { username, password } = req.body;
    try {
      const user = await authService.login(username, password);
      res.json(user);
    } catch (e) {
      // 401 Unauthorized for bad login
      if (e.message.includes('salah')) {
        return res.status(401).json({ error: e.message });
      }
      res.status(500).json({ error: e.message });
    }
  }

  async logout(req, res) {
    // Pada arsitektur yang menggunakan JWT/Session, di sini token di-blacklist atau session di-destroy.
    // Karena kita saat ini menggunakan state di client-side, cukup kembalikan success.
    res.json({ success: true, message: 'Berhasil logout' });
  }
}

module.exports = new AuthController();
