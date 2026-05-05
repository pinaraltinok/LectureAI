/**
 * Service Composition Root — Single entry point for all service instances.
 *
 * This module is the ONLY place where concrete dependencies (Prisma client)
 * are wired into service factories. Controllers import from here,
 * never directly from service files.
 *
 * Design Pattern: Composition Root (Seemann, 2019)
 *   "A Composition Root is a (preferably) unique location in an application
 *    where modules are composed together."
 *
 * SOLID: Dependency Inversion Principle (Martin, 2017)
 *   High-level services depend on `db` abstraction (parameter),
 *   not on the concrete Prisma import.
 *
 * @example
 *   // In production (this file):
 *   const services = require('./services');
 *   services.reportService.getDraft(jobId);
 *
 *   // In unit tests:
 *   const createReportService = require('./services/report.service');
 *   const mockDb = { report: { findUnique: jest.fn() } };
 *   const reportService = createReportService(mockDb);
 */
const prisma = require('../config/db');

const createReportService = require('./report.service');
const createUserService = require('./user.service');
const createCourseService = require('./course.service');
const createGroupService = require('./group.service');

module.exports = {
  reportService: createReportService(prisma),
  userService: createUserService(prisma),
  courseService: createCourseService(prisma),
  groupService: createGroupService(prisma),
};
