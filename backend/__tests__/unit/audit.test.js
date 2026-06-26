'use strict';

/**
 * Unit tests for audit utility.
 * Covers the try/catch branches: successful DB write and graceful error suppression.
 */

jest.mock('../../src/config/db', () => ({
  prisma: {
    auditLog: {
      create: jest.fn(),
    },
  },
}));

jest.mock('../../src/config/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}));

const { prisma } = require('../../src/config/db');
const logger = require('../../src/config/logger');
const { auditLog } = require('../../src/utils/audit');

describe('auditLog', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes an audit entry to the database', async () => {
    prisma.auditLog.create.mockResolvedValue({ id: 'al1' });

    await auditLog({ userId: 'u1', action: 'LOGIN', details: 'User logged in', ipAddress: '::1' });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: { userId: 'u1', action: 'LOGIN', details: 'User logged in', ipAddress: '::1' },
    });
  });

  it('defaults userId and ipAddress to null', async () => {
    prisma.auditLog.create.mockResolvedValue({ id: 'al2' });

    await auditLog({ action: 'SYSTEM_EVENT', details: 'Scheduled job ran' });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: { userId: null, action: 'SYSTEM_EVENT', details: 'Scheduled job ran', ipAddress: null },
    });
  });

  it('swallows errors and logs them instead of throwing (exercises catch branch)', async () => {
    prisma.auditLog.create.mockRejectedValue(new Error('DB connection lost'));

    // Should NOT throw
    await expect(
      auditLog({ userId: 'u1', action: 'LOGOUT', details: 'Logged out', ipAddress: null })
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('AuditLog write failed [LOGOUT]')
    );
  });
});
