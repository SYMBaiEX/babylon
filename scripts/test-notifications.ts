/**
 * Test Notifications Script
 * 
 * Tests that the notification system is working properly and
 * sends welcome notifications to existing users who don't have any yet
 */

import { PrismaClient } from '@prisma/client';
import { notifyNewAccount } from '../src/lib/services/notification-service';

const prisma = new PrismaClient();

async function main() {
  console.log('🔔 Testing notification system...\n');

  // Get all users who are not actors
  const users = await prisma.user.findMany({
    where: {
      isActor: false,
    },
    select: {
      id: true,
      displayName: true,
      username: true,
      _count: {
        select: {
          notifications: true,
        },
      },
    },
  });

  console.log(`Found ${users.length} real users\n`);

  // Send welcome notifications to users who don't have any notifications yet
  let sentCount = 0;
  for (const user of users) {
    if (user._count.notifications === 0) {
      console.log(`Sending welcome notification to ${user.displayName || user.username || user.id}...`);
      try {
        await notifyNewAccount(user.id);
        sentCount++;
        console.log(`✅ Sent!\n`);
      } catch (error) {
        console.error(`❌ Failed to send notification:`, error);
      }
    } else {
      console.log(`${user.displayName || user.username || user.id} already has ${user._count.notifications} notification(s)`);
    }
  }

  console.log(`\n✨ Sent ${sentCount} welcome notifications`);

  // Show notification stats
  const totalNotifications = await prisma.notification.count();
  const unreadNotifications = await prisma.notification.count({
    where: { read: false },
  });
  const notificationsByType = await prisma.notification.groupBy({
    by: ['type'],
    _count: {
      type: true,
    },
  });

  console.log('\n📊 Notification Statistics:');
  console.log(`Total notifications: ${totalNotifications}`);
  console.log(`Unread notifications: ${unreadNotifications}`);
  console.log('\nNotifications by type:');
  notificationsByType.forEach((stat) => {
    console.log(`  ${stat.type}: ${stat._count.type}`);
  });

  // Show recent notifications
  const recentNotifications = await prisma.notification.findMany({
    take: 5,
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      user: {
        select: {
          displayName: true,
          username: true,
        },
      },
    },
  });

  console.log('\n📬 Recent notifications:');
  recentNotifications.forEach((notif) => {
    const recipientName = notif.user.displayName || notif.user.username || 'Unknown';
    console.log(`  [${notif.type}] to ${recipientName}: "${notif.message}" (${notif.read ? 'read' : 'unread'})`);
  });
}

main()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

