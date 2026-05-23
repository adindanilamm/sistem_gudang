const prisma = require('../config/database');

class AuthService {
  async login(username, password) {
    const user = await prisma.user.findFirst({
      where: { username, password },
    });
    if (!user) {
      throw new Error('Username atau password salah!');
    }
    return user;
  }
}

module.exports = new AuthService();
