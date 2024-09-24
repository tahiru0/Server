import { EventEmitter } from 'events';

class NotificationStream {
  constructor() {
    this.emitter = new EventEmitter();
  }

  sendNotification(notification) {
    this.emitter.emit('notification', notification);
  }

  subscribe(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const sendNotification = (notification) => {
      console.log('Notification received in stream:', notification);
      console.log('User info:', req.user);
      if (notification.recipient.toString() === req.user._id.toString() &&
          notification.recipientModel === req.userModel &&
          (req.userModel === 'Student' ||
           req.userModel === 'Admin' ||
           (req.userModel === 'CompanyAccount' && notification.recipientRole === req.user.role) ||
           (req.userModel === 'SchoolAccount' && notification.recipientRole === req.user.role))) {
        res.write(`data: ${JSON.stringify({ notification })}\n\n`);
      }
    };

    this.emitter.on('notification', sendNotification);

    req.on('close', () => {
      this.emitter.off('notification', sendNotification);
    });
  }
}

export default new NotificationStream();
