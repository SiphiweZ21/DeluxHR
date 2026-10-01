import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../src/common/auth/password';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const fullName = process.env.SUPER_ADMIN_NAME?.trim();
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  if (!fullName) {
    throw new Error('SUPER_ADMIN_NAME is not set');
  }

  if (!email) {
    throw new Error('SUPER_ADMIN_EMAIL is not set');
  }

  if (!password) {
    throw new Error('SUPER_ADMIN_PASSWORD is not set');
  }

  if (password.length < 12) {
    throw new Error(
      'SUPER_ADMIN_PASSWORD must be at least 12 characters long',
    );
  }

  const adapter = new PrismaPg({
    connectionString,
  });

  const prisma = new PrismaClient({ adapter });

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      if (existing.role === UserRole.SUPER_ADMIN) {
        console.log(`Super Admin already exists: ${email}`);
        return;
      }

      throw new Error(
        `A user already exists with email ${email}. Bootstrap stopped without changing that account.`,
      );
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        passwordHash,
        role: UserRole.SUPER_ADMIN,
        organizationId: null,
        isActive: true,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        organizationId: true,
        isActive: true,
        createdAt: true,
      },
    });

    console.log('Super Admin created successfully.');
    console.log({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      isActive: user.isActive,
      createdAt: user.createdAt,
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    'Super Admin bootstrap failed:',
    error instanceof Error ? error.message : error,
  );

  process.exit(1);
});