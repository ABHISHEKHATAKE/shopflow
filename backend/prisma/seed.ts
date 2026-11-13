import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const products: [string, string, number, number][] = [
  ['Mechanical Keyboard', 'Hot-swappable 75% board with tactile switches.', 549900, 25],
  ['Noise-Cancelling Headphones', 'Over-ear, 30-hour battery, USB-C.', 899900, 15],
  ['27" 4K Monitor', 'IPS panel, 60Hz, USB-C power delivery.', 2499900, 8],
  ['Ergonomic Mouse', 'Vertical grip, programmable buttons.', 249900, 40],
  ['USB-C Dock', '8-in-1 hub with HDMI, SD and Ethernet.', 349900, 30],
  ['Laptop Stand', 'Aluminium stand, adjustable height.', 129900, 60],
  ['Webcam 1080p', 'Auto-focus with privacy shutter.', 299900, 20],
  ['Desk Mat', 'Large felt mat, 90 x 40 cm.', 99900, 100],
  ['Limited Edition Keycaps', 'Only 5 sets. Use this one to test stock locking.', 199900, 5],
];

async function main() {
  await prisma.user.upsert({
    where: { email: 'admin@shopflow.dev' },
    update: {},
    create: { email: 'admin@shopflow.dev', name: 'Admin', passwordHash: await bcrypt.hash('Admin@123', 10), role: 'ADMIN' },
  });
  await prisma.user.upsert({
    where: { email: 'user@shopflow.dev' },
    update: {},
    create: { email: 'user@shopflow.dev', name: 'Demo User', passwordHash: await bcrypt.hash('User@1234', 10) },
  });
  if ((await prisma.product.count()) === 0) {
    await prisma.product.createMany({
      data: products.map(([name, description, priceCents, stock]) => ({ name, description, priceCents, stock })),
    });
  }
  // Database-level safety net: stock can never go negative, even if application code has a bug.
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Product" ADD CONSTRAINT product_stock_non_negative CHECK (stock >= 0)`,
    );
  } catch {
    /* constraint already exists */
  }
  console.log('Seeded. Admin: admin@shopflow.dev / Admin@123 | User: user@shopflow.dev / User@1234');
}

main().finally(() => prisma.$disconnect());
