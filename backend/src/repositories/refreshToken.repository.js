'use strict';

const { prisma } = require('../config/db');

/**
 * Refresh sessions (Phase 2): one row per issued refresh token, stored as a
 * SHA-256 hash. Rotation revokes the presented row and issues a new one;
 * revoking is always a conditional updateMany (CAS) so races can't double-issue.
 */
const refreshTokenRepository = {
  create: (data) => prisma.refreshToken.create({ data }),

  findByHash: (tokenHash) => prisma.refreshToken.findUnique({ where: { tokenHash } }),

  /** CAS-revoke a single session. Returns { count } — 0 means already revoked. */
  revokeById: (id) =>
    prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),

  revokeByHash: (tokenHash) =>
    prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    }),

  revokeAllForUser: (userId) =>
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
};

module.exports = refreshTokenRepository;
