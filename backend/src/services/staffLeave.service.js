'use strict';

const staffLeaveRepository = require('../repositories/staffLeave.repository');
const staffRepository = require('../repositories/staff.repository');
const { prisma } = require('../config/db');
const { auditLog } = require('../utils/audit');
const ApiError = require('../utils/ApiError');

// Sanity cap so a typo (e.g. year-long range) cannot lock hundreds of dates.
const MAX_LEAVE_DAYS = 366;

function eachDateUtc(startDate, endDate) {
  const dates = [];
  const cur = new Date(startDate);
  while (cur <= endDate) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

const staffLeaveService = {
  async getLeaveForStaff(staffId) {
    const staff = await staffRepository.findById(staffId);
    if (!staff) throw ApiError.notFound('Staff member not found');
    return staffLeaveRepository.findByStaffId(staffId);
  },

  async getAllUpcomingLeave() {
    return staffLeaveRepository.findAllUpcoming();
  },

  /**
   * Create a leave (blackout) period. Serialized against in-flight bookings:
   * we take the SAME per-date advisory lock createAppointment holds (dates in
   * ascending order to stay deadlock-free), then verify (a) no overlapping
   * leave exists and (b) no live appointment would be stranded. Holding the
   * locks first means a booking racing us either commits before we read it
   * (we reject) or waits and sees our committed leave (it rejects).
   */
  async createLeave(staffId, dto, actorId = null, ipAddress = null) {
    const staff = await staffRepository.findById(staffId);
    if (!staff || !staff.isActive) {
      throw ApiError.notFound('Staff member not found or inactive');
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    const lockDates = eachDateUtc(startDate, endDate);
    if (lockDates.length > MAX_LEAVE_DAYS) {
      throw ApiError.badRequest(`Leave period cannot exceed ${MAX_LEAVE_DAYS} days`);
    }

    const leave = await prisma.$transaction(
      async (tx) => {
        for (const dateStr of lockDates) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`salon:booking:${dateStr}`})::bigint)`;
        }

        const overlapping = await staffLeaveRepository.findOverlapping(staffId, startDate, endDate, tx);
        if (overlapping.length > 0) {
          throw ApiError.conflict('A leave period already overlaps this range for this stylist');
        }

        const apptCount = await staffLeaveRepository.countAppointmentsIn(staffId, startDate, endDate, tx);
        if (apptCount > 0) {
          throw ApiError.conflict(
            `${apptCount} existing appointment(s) fall in this range — reschedule or cancel them before marking time off`
          );
        }

        return staffLeaveRepository.create(
          { staffId, startDate, endDate, reason: dto.reason || null },
          tx
        );
      },
      { timeout: 10000 }
    );

    await auditLog({
      userId: actorId,
      action: 'CREATE_STAFF_LEAVE',
      details: `Created leave ${leave.id} for staff ${staff.name}: ${dto.startDate} → ${dto.endDate}`,
      ipAddress,
    });

    return leave;
  },

  async deleteLeave(leaveId, actorId = null, ipAddress = null) {
    const leave = await staffLeaveRepository.findById(leaveId);
    if (!leave) throw ApiError.notFound('Leave period not found');

    await staffLeaveRepository.delete(leaveId);

    await auditLog({
      userId: actorId,
      action: 'DELETE_STAFF_LEAVE',
      details: `Deleted leave ${leaveId} for staff ${leave.staffId}`,
      ipAddress,
    });
  },
};

module.exports = staffLeaveService;
