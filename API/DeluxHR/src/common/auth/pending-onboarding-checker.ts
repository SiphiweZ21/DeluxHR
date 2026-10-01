import { ForbiddenException } from '@nestjs/common';
import { OrganizationStatus, Prisma, UserRole } from '@prisma/client';

/** Called only inside dedicated onboarding approval transactions. */
export async function assertPendingOnboardingChecker(
  tx: Prisma.TransactionClient,
  organizationId: string,
  makerUserId: string,
  checkerUserId: string,
): Promise<void> {
  if (makerUserId === checkerUserId) {
    throw new ForbiddenException(
      'Independent onboarding approval requires a different company administrator.',
    );
  }
  // Keep activation/suspension and account changes from racing this exception.
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "User" WHERE id IN (${makerUserId}, ${checkerUserId}) ORDER BY id FOR SHARE`;
  const [organization, users] = await Promise.all([
    tx.organization.findUnique({
      where: { id: organizationId },
      select: { status: true },
    }),
    tx.user.findMany({
      where: { id: { in: [makerUserId, checkerUserId] } },
      select: { id: true, role: true, organizationId: true, isActive: true },
    }),
  ]);
  if (
    organization?.status !== OrganizationStatus.PENDING ||
    users.length !== 2 ||
    !users.every(
      (user) =>
        user.organizationId === organizationId &&
        user.role === UserRole.COMPANY_ADMIN &&
        user.isActive,
    )
  ) {
    throw new ForbiddenException(
      'Pending onboarding approval requires two different active company administrators in this organization.',
    );
  }
}
