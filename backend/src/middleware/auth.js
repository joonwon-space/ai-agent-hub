const prisma = require('../services/db');

async function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: '인증이 필요합니다.' });
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: '세션이 만료되었습니다.' });
    }
    req.user = { id: user.id, email: user.email };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAuth };
