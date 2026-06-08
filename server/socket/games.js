const jwt = require('jsonwebtoken');
const db = require('../config/database');

module.exports = (io) => {
  const gamesNS = io.of('/games');

  gamesNS.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('No token'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch {
      next(new Error('Auth failed'));
    }
  });

  gamesNS.on('connection', (socket) => {
    socket.on('join_chat', ({ room }) => {
      socket.join(room);
    });
    socket.on('chat', ({ room, message, username }) => {
      if (!message?.trim()) return;
      gamesNS.to(room).emit('chat', {
        user: username,
        message: message.trim().substring(0, 200),
        type: 'player',
        time: new Date().toISOString()
      });
    });
    socket.on('disconnect', () => {});
  });
};
