const prisma = require('../config/database');

class UserService {
  async getAllUsers(options = {}) {
    const limit = options.limit;
    return prisma.user.findMany({
      orderBy: { id: 'asc' },
      ...(limit ? { take: limit } : {}),
    });
  }

  async createUser(data) {
    if (!data.username || !String(data.username).trim()) throw new Error('Username harus diisi');
    if (!data.password || !String(data.password).trim()) throw new Error('Password harus diisi');
    if (!data.name || !String(data.name).trim()) throw new Error('Nama harus diisi');

    try {
      return await prisma.user.create({
        data: {
          username: String(data.username).trim(),
          password: String(data.password),
          role: data.role || 'karyawan',
          name: String(data.name).trim(),
          phone: data.phone || null,
          email: data.email || null,
        },
      });
    } catch (e) {
      if (e.code === 'P2002') throw new Error('Username sudah ada');
      throw e;
    }
  }

  async updateUser(oldUsername, data) {
    try {
      const updateData = {};

      if (data.username !== undefined) {
        if (!String(data.username).trim()) throw new Error('Username harus diisi');
        updateData.username = String(data.username).trim();
      }
      if (data.name !== undefined) {
        if (!String(data.name).trim()) throw new Error('Nama harus diisi');
        updateData.name = String(data.name).trim();
      }
      if (data.phone !== undefined) updateData.phone = data.phone || null;
      if (data.email !== undefined) updateData.email = data.email || null;
      if (data.password !== undefined && data.password !== '') updateData.password = data.password;

      const user = await prisma.user.update({
        where: { username: oldUsername },
        data: updateData,
      });

      return user;
    } catch (e) {
      if (e.code === 'P2002') throw new Error('Username sudah digunakan');
      throw e;
    }
  }

  async deleteUser(username) {
    await prisma.user.delete({ where: { username } });
    return { success: true };
  }
}

module.exports = new UserService();
