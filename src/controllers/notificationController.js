const prisma = require('../config/db');

// GET /api/v1/notifications/my — fetch all notifications for logged-in user
const getMyNotifications = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    res.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Server error fetching notifications' });
  }
};

// GET /api/v1/notifications/unread-count
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ count: 0 });

    const count = await prisma.notification.count({
      where: { userId, isRead: false }
    });

    res.json({ count });
  } catch (error) {
    res.status(500).json({ count: 0 });
  }
};

// PATCH /api/v1/notifications/:id/read
const markRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    await prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error marking notification read' });
  }
};

// PATCH /api/v1/notifications/read-all
const markAllRead = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error marking all read' });
  }
};

// Internal helper — called when any document is uploaded (general or checklist)
const createDocumentNotification = async ({ userId, clientName: inputClientName, clientId, documentId, documentName, category, reqApp }) => {
  try {
    // 1. Fetch client details if clientId is provided
    let client = null;
    if (clientId) {
      client = await prisma.client.findUnique({
        where: { id: clientId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          assignedToId: true,
          assignedTo: {
            select: { id: true, email: true, hotlineNumber: true, fullName: true }
          }
        }
      });
    }

    const clientName = (client ? `${client.firstName} ${client.lastName}`.trim() : inputClientName) || 'Client';
    const targetUserId = userId || client?.assignedToId;

    // 2. Find ALL relevant staff members (super_admin, admin, operations, plus assigned consultant)
    const staffMembers = await prisma.user.findMany({
      where: {
        OR: [
          { role: { in: ['super_admin', 'admin', 'operations'] } },
          ...(targetUserId ? [{ id: targetUserId }] : [])
        ]
      },
      select: { id: true, email: true, hotlineNumber: true, fullName: true, role: true }
    });

    // 3. Create internal CRM Notifications in DB for all relevant staff
    const title = `📄 New Document from ${clientName}`;
    const body = `${clientName} uploaded "${documentName}" (${category || 'General'}). Please review and verify.`;

    if (staffMembers.length > 0) {
      try {
        if (prisma.notification && typeof prisma.notification.createMany === 'function') {
          const notificationEntries = staffMembers.map(staff => ({
            userId: staff.id,
            type: 'new_document',
            title,
            body,
            clientId: clientId || null,
            documentId: documentId || null,
            isRead: false
          }));

          await prisma.notification.createMany({
            data: notificationEntries,
            skipDuplicates: true
          });
        }
      } catch (dbNotifErr) {
        console.warn('[Notification DB Write Warn]:', dbNotifErr.message);
      }
    }

    // 4. Real-time Socket.io Broadcast to live CRM dashboards
    if (reqApp) {
      const io = reqApp.get('io');
      if (io) {
        io.emit('new-notification', { title, body, type: 'new_document', clientId, documentId });
        console.log(`[Document Notification] 📡 Socket.io broadcast sent for document: ${documentName}`);
      }
    }

  } catch (error) {
    console.error('Error creating document notification:', error);
    // Non-fatal — don't throw, just log
  }
};

// Internal helper — called when a new lead form is submitted or assessment booked
const createLeadNotification = async ({ leadName, email, phone, country, serviceCategory, appointmentDate, reqApp }) => {
  try {
    // Find ALL staff members across every role so nobody misses the notification
    const staffMembers = await prisma.user.findMany({
      where: {
        role: { in: ['super_admin', 'admin', 'operations', 'consultant', 'finance', 'marketing', 'agent'] }
      },
      select: { id: true, role: true }
    });

    console.log(`[Lead Notification] Found ${staffMembers.length} staff members to notify for lead: ${leadName || email}`);

    if (!staffMembers || staffMembers.length === 0) {
      console.warn('[Lead Notification] No staff members found in DB — skipping notification creation.');
      return;
    }

    const isBooking = !!appointmentDate;
    const title = isBooking 
      ? `📅 Assessment Booked: ${leadName || email || 'Client'}`
      : `🎯 New Lead: ${leadName || email || 'Client'}`;

    let formattedDate = '';
    if (appointmentDate) {
      const str = String(appointmentDate).trim();
      const match = str.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/);
      if (match) {
        const [, yyyy, mm, dd, rest] = match;
        formattedDate = `${dd}/${mm}/${yyyy}${rest}`;
      } else {
        try {
          const parsed = new Date(appointmentDate);
          if (!isNaN(parsed.getTime())) {
            const day = String(parsed.getDate()).padStart(2, '0');
            const month = String(parsed.getMonth() + 1).padStart(2, '0');
            const year = parsed.getFullYear();
            const timeStr = parsed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            formattedDate = `${day}/${month}/${year} ${timeStr}`;
          } else {
            formattedDate = appointmentDate;
          }
        } catch (_) {
          formattedDate = appointmentDate;
        }
      }
    }

    const body = isBooking
      ? `${leadName || email} (${country || 'Global'}) booked a Discovery Session for ${serviceCategory || 'IT Services'} on ${formattedDate}.`
      : `${leadName || email} (${country || 'Global'}) submitted a project inquiry for ${serviceCategory || 'IT Services'}.`;

    const notificationEntries = staffMembers.map(staff => ({
      userId: staff.id,
      type: isBooking ? 'new_booking' : 'new_lead',
      title,
      body,
      isRead: false
    }));

    await prisma.notification.createMany({
      data: notificationEntries,
      skipDuplicates: true
    });

    console.log(`[Lead Notification] ✅ Created ${notificationEntries.length} notifications for "${leadName || email}"`);

    // Broadcast via Socket.io so UI updates in real-time without waiting for the 15s poll
    if (reqApp) {
      const io = reqApp.get('io');
      if (io) {
        io.emit('new-notification', { title, body, isBooking });
        console.log('[Lead Notification] 📡 Socket.io broadcast sent.');
      } else {
        console.warn('[Lead Notification] Socket.io not available on req.app.');
      }
    } else {
      console.warn('[Lead Notification] reqApp not provided — skipping socket broadcast.');
    }
  } catch (error) {
    console.error('[Lead Notification] ❌ Error creating notification:', error.message, error.stack);
  }
};

// Internal helper — called when an existing consultation is rescheduled
const createRescheduleNotification = async ({ clientName, date, timeSlot, consultationId, clientId, assignedToId, reqApp }) => {
  try {
    const staffMembers = await prisma.user.findMany({
      where: {
        role: { in: ['super_admin', 'admin', 'operations', 'consultant', 'finance', 'marketing', 'agent'] }
      },
      select: { id: true, role: true }
    });

    const recipientIds = new Set(staffMembers.map(s => s.id));
    if (assignedToId) {
      recipientIds.add(assignedToId);
    }

    const dayjs = require('dayjs');
    const formattedDate = date ? (date.includes('-') ? dayjs(date).format('DD/MM/YYYY') : date) : date;

    const notifTitle = `🔄 Meeting Rescheduled: ${clientName || 'Client'}`;
    const notifBody = `Appointment for ${clientName || 'Client'} has been rescheduled to ${formattedDate} at ${timeSlot} (UAE).`;

    const notificationEntries = Array.from(recipientIds).map(userId => ({
      userId,
      type: 'meeting_rescheduled',
      title: notifTitle,
      body: notifBody,
      isRead: false,
      clientId: clientId || null
    }));

    if (notificationEntries.length > 0) {
      await prisma.notification.createMany({
        data: notificationEntries,
        skipDuplicates: true
      });
      console.log(`[Reschedule Notification] ✅ Created ${notificationEntries.length} notifications for rescheduled meeting: ${clientName}`);
    }

    if (reqApp) {
      const io = reqApp.get('io');
      if (io) {
        io.emit('new-notification', {
          title: notifTitle,
          body: notifBody,
          type: 'meeting_rescheduled',
          clientId: clientId || null,
          consultationId: consultationId || null
        });
        console.log('[Reschedule Notification] 📡 Socket.io broadcast sent.');
      }
    }
  } catch (error) {
    console.error('[Reschedule Notification] ❌ Error creating reschedule notification:', error.message, error.stack);
  }
};

module.exports = {
  getMyNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  createDocumentNotification,
  createLeadNotification,
  createRescheduleNotification
};
