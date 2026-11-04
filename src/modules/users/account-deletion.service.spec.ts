import { BadRequestException, ConflictException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MailService } from '../mail/mail.service';
import type { AuthConfigService } from '../auth/services/auth-config.service';
import type { RentalDocumentsService } from '../rentals/rental-documents.service';
import { AccountDeletionService } from './account-deletion.service';
import {
  hasDeletionObligations,
  assertNoAccountDeletion,
} from './account-deletion-policy';
import { AccountDeletionRestoreGuard } from './account-deletion-restore.guard';
import type { AccountDeletionRequest, Prisma } from '@prisma/client';

jest.setTimeout(20_000);

function fixture() {
  const account = {
    id: 7,
    correo: 'fixture@example.test',
    activo: true,
    rol: 'CLIENT',
    emailVerifiedAt: new Date(),
    createdAt: new Date('2026-01-01'),
  };
  let request: AccountDeletionRequest | null = null;
  const events: string[] = [];
  const db = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
    user: {
      findFirst: jest.fn().mockResolvedValue(account),
      findUnique: jest.fn(() => Promise.resolve(account)),
      update: jest.fn(() => {
        account.activo = false;
        events.push('disabled');
        return Promise.resolve();
      }),
      delete: jest.fn(() => {
        events.push('user-deleted');
        return Promise.resolve();
      }),
    },
    accountDeletionRequest: {
      findUnique: jest.fn(() => Promise.resolve(request)),
      findFirst: jest.fn(() => Promise.resolve(request)),
      upsert: jest.fn(
        ({
          create,
          update,
        }: {
          create: Partial<AccountDeletionRequest>;
          update: Partial<AccountDeletionRequest>;
        }) => {
          request = request
            ? { ...request, ...update }
            : {
                id: '0cb2c7f9-e344-41f7-a307-c3a6adbde419',
                status: 'AWAITING_CONFIRMATION',
                userId: 7,
                subjectId: 7,
                subjectCreatedAt: account.createdAt,
                codeHash: null,
                codeExpiresAt: null,
                attemptCount: 0,
                resendAt: null,
                confirmedAt: null,
                completedAt: null,
                nextAttemptAt: new Date(),
                leaseUntil: null,
                errorCode: null,
                createdAt: new Date(),
                ...create,
              };
          return Promise.resolve(request);
        },
      ),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        if (!request) throw new Error('fixture missing');
        const attempts =
          typeof data.attemptCount === 'object'
            ? request.attemptCount + 1
            : (data.attemptCount ?? request.attemptCount);
        request = {
          ...request,
          ...data,
          attemptCount: attempts,
        } as AccountDeletionRequest;
        return Promise.resolve(request);
      }),
      updateMany: jest.fn(
        ({ data }: { data: Partial<AccountDeletionRequest> }) => {
          if (request) request = { ...request, ...data };
          return Promise.resolve({ count: 1 });
        },
      ),
    },
    rentalRequest: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    rentalStatusHistory: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    rentalRequestItem: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    loginAttempt: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    securityNotice: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    rentalDocument: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    userSession: {
      updateMany: jest.fn(() => {
        events.push('sessions-revoked');
        return Promise.resolve({ count: 1 });
      }),
    },
    pushSubscription: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  db.$transaction.mockImplementation(
    (action: (tx: typeof db) => Promise<unknown>) => action(db),
  );
  const prisma = { asAdmin: () => db } as unknown as PrismaService;
  const mail = { sendEmail: jest.fn().mockResolvedValue(undefined) };
  const documents = {
    deleteAllAccountAssets: jest.fn(() => {
      events.push('assets-deleted');
      return Promise.resolve();
    }),
  };
  const service = new AccountDeletionService(
    prisma,
    mail as unknown as MailService,
    {
      passwordResetExpiresMinutes: 10,
      passwordResetMaxAttempts: 3,
    } as AuthConfigService,
    documents as unknown as RentalDocumentsService,
  );
  const code = () => {
    const call = mail.sendEmail.mock.calls[0] as unknown as [{ text: string }];
    return call[0].text.match(/\d{8}/)![0];
  };
  return {
    service,
    db,
    mail,
    account,
    documents,
    events,
    prisma,
    code,
    getRequest: () => request,
  };
}

describe('AccountDeletionService', () => {
  test('a reused identifier with a different creation date never deletes another account', async () => {
    const f = fixture();
    await f.service.request(f.account.correo);
    const receipt = await f.service.confirm(f.account.correo, f.code());
    f.account.createdAt = new Date('2026-02-01');
    await f.service.process(receipt.id);
    expect(f.getRequest()!.errorCode).toBe('SUBJECT_MISMATCH');
    expect(f.documents.deleteAllAccountAssets).not.toHaveBeenCalled();
    expect(f.db.user.delete).not.toHaveBeenCalled();
  });
  test('unknown addresses receive the generic response without a deletion request', async () => {
    const f = fixture();
    f.db.user.findFirst.mockResolvedValue(null as never);
    const result = await f.service.request('unknown@example.test');
    expect(result).toHaveProperty('resendAt');
    expect(result).not.toHaveProperty('code');
    expect(f.mail.sendEmail).not.toHaveBeenCalled();
    expect(f.getRequest()).toBeNull();
  });
  test('codes are hashed, bounded and resend cannot invalidate a challenge within 60 seconds', async () => {
    const f = fixture();
    await f.service.request(f.account.correo);
    const hash = f.getRequest()!.codeHash;
    expect(hash).not.toBe(f.code());
    expect(hash).toBeTruthy();
    await f.service.request(f.account.correo);
    expect(f.mail.sendEmail).toHaveBeenCalledTimes(1);
    expect(f.getRequest()!.codeHash).toBe(hash);
  });
  test('wrong attempts persist and stop a later correct code', async () => {
    const f = fixture();
    await f.service.request(f.account.correo);
    const wrong = f.code() === '00000000' ? '11111111' : '00000000';
    for (let i = 0; i < 3; i++)
      await expect(
        f.service.confirm(f.account.correo, wrong),
      ).rejects.toBeInstanceOf(BadRequestException);
    expect(f.getRequest()!.attemptCount).toBe(3);
    await expect(
      f.service.confirm(f.account.correo, f.code()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(f.db.user.delete).not.toHaveBeenCalled();
  });
  test('expired challenges cannot authorize deletion', async () => {
    const f = fixture();
    await f.service.request(f.account.correo);
    await f.db.accountDeletionRequest.update({
      data: { codeExpiresAt: new Date(0) },
    });
    await expect(
      f.service.confirm(f.account.correo, f.code()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  test('confirmed requests wait for obligations, keeping access and external files', async () => {
    const f = fixture();
    await f.service.request(f.account.correo);
    f.db.rentalRequest.findMany.mockResolvedValue([
      {
        status: 'DELIVERED',
        depositTotal: 10,
        depositStatus: 'PENDING',
        deliveredAt: new Date(),
      },
    ]);
    const receipt = await f.service.confirm(f.account.correo, f.code());
    expect(receipt.status).toBe('WAITING_OBLIGATIONS');
    await f.service.process(receipt.id);
    expect(f.account.activo).toBe(true);
    expect(f.documents.deleteAllAccountAssets).not.toHaveBeenCalled();
  });
  test('external failure never reports completed or removes recovery metadata; retry completes', async () => {
    const f = fixture();
    await f.service.request(f.account.correo);
    const receipt = await f.service.confirm(f.account.correo, f.code());
    f.documents.deleteAllAccountAssets.mockRejectedValueOnce(
      new Error('storage unavailable'),
    );
    await f.service.process(receipt.id);
    expect(f.getRequest()!.completedAt).toBeNull();
    expect(f.getRequest()!.errorCode).toBe('CLEANUP_RETRY');
    expect(f.db.user.delete).not.toHaveBeenCalled();
    expect(f.account.activo).toBe(false);
    await f.service.process(receipt.id);
    expect(f.getRequest()!.status).toBe('COMPLETED');
    expect(f.events.indexOf('assets-deleted')).toBeLessThan(
      f.events.indexOf('user-deleted'),
    );
    expect(f.events.indexOf('sessions-revoked')).toBeLessThan(
      f.events.indexOf('assets-deleted'),
    );
    const mutation = f.db.rentalRequest.updateMany.mock.calls[0] as unknown as [
      { data: Record<string, unknown> },
    ];
    expect(mutation[0].data).toMatchObject({
      userId: null,
      applicantEmail: null,
      patientName: null,
      deliveryAddress: null,
      notes: null,
    });
  });
  test('a live lease prevents a second worker and completion is idempotent', async () => {
    const f = fixture();
    await f.service.request(f.account.correo);
    const receipt = await f.service.confirm(f.account.correo, f.code());
    await f.db.accountDeletionRequest.update({
      data: { leaseUntil: new Date(Date.now() + 60_000) },
    });
    await f.service.process(receipt.id);
    expect(f.documents.deleteAllAccountAssets).not.toHaveBeenCalled();
    await f.db.accountDeletionRequest.update({ data: { leaseUntil: null } });
    await f.service.process(receipt.id);
    await f.service.process(receipt.id);
    expect(f.db.user.delete).toHaveBeenCalledTimes(1);
  });
  test('mail failure invalidates the issued code', async () => {
    const f = fixture();
    f.mail.sendEmail.mockRejectedValueOnce(new Error('mail unavailable'));
    await expect(f.service.request(f.account.correo)).rejects.toThrow(
      'No pudimos enviar',
    );
    expect(f.getRequest()!.codeHash).toBeNull();
  });
  test('a changed email cannot use the old challenge', async () => {
    const f = fixture();
    await f.service.request(f.account.correo);
    // request lookup and locked account must agree; a stale lookup is not authorization.
    f.db.user.findFirst.mockResolvedValue({ ...f.account });
    f.account.correo = 'new@example.test';
    await expect(
      f.service.confirm('fixture@example.test', f.code()),
    ).rejects.toThrow();
  });
});

test('rental/deposit policy distinguishes settled history from open obligations', () => {
  const base = {
    status: 'RETURNED',
    depositTotal: 20,
    depositStatus: 'RETURNED',
    deliveredAt: new Date(),
  };
  expect(hasDeletionObligations(base)).toBe(false);
  expect(hasDeletionObligations({ ...base, depositStatus: 'PENDING' })).toBe(
    true,
  );
  for (const status of ['PENDING', 'APPROVED', 'DELIVERED'])
    expect(hasDeletionObligations({ ...base, status })).toBe(true);
  expect(
    hasDeletionObligations({
      ...base,
      status: 'REJECTED',
      depositStatus: 'PENDING',
      deliveredAt: null,
    }),
  ).toBe(false);
});

test('new rental mutations and backup restoration fail closed after confirmation', async () => {
  const f = fixture();
  await f.service.request(f.account.correo);
  await assertNoAccountDeletion(f.db as unknown as Prisma.TransactionClient, 7);
  await f.service.confirm(f.account.correo, f.code());
  await expect(
    assertNoAccountDeletion(f.db as unknown as Prisma.TransactionClient, 7),
  ).rejects.toBeInstanceOf(ConflictException);
  const guard = new AccountDeletionRestoreGuard(f.prisma);
  await expect(guard.canActivate()).rejects.toBeInstanceOf(ConflictException);
  f.db.accountDeletionRequest.findFirst.mockRejectedValueOnce(
    new Error('database unavailable'),
  );
  await expect(guard.canActivate()).rejects.toThrow('database unavailable');
});
