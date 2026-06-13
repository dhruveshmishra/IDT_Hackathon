const Message = require('../models/Message');

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('User connected to socket:', socket.id);

    // Join booking chat room
    socket.on('join-room', (bookingId) => {
      socket.join(bookingId);
      console.log(`Socket ${socket.id} joined booking room: ${bookingId}`);
    });

    // Join personal notification room (by userId)
    socket.on('join-user-room', (userId) => {
      socket.join(`user-${userId}`);
      console.log(`Socket ${socket.id} joined personal room: user-${userId}`);
    });

    socket.on('send-message', async (data) => {
      try {
        const { bookingId, senderId, receiverId, text } = data;
        if (!bookingId || !senderId || !receiverId || !text) {
          return;
        }

        const msg = await Message.create({
          booking: bookingId,
          sender: senderId,
          receiver: receiverId,
          text: text
        });

        // Emit to all users in the booking room
        io.to(bookingId).emit('receive-message', msg);

        // Notify receiver's personal room (for sidebar badge update)
        io.to(`user-${receiverId}`).emit('new-message-notify', {
          bookingId,
          senderId,
          text
        });
      } catch (err) {
        console.error('Socket send-message database error:', err.message);
      }
    });

    socket.on('booking-update', (data) => {
      // Send real-time notification to the seller/renter room
      if (data.sellerId) {
        io.to(data.sellerId).emit('booking-notification', data);
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected from socket:', socket.id);
    });
  });
};
