import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticateJWT, optionalJWT } from '../middleware/auth.js';
import { writeRateLimiter } from '../middleware/rateLimit.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import {
  createEmergencyContact,
  deleteEmergencyContact,
  findNearbyHospitals,
  listAssistanceHistory,
  listEmergencyContacts,
  recordAssistanceEvent,
  updateEmergencyContact,
} from '../services/sosService.js';
import { sendSuccess } from '../utils/response.js';
import {
  createAssistanceLogSchema,
  createEmergencyContactSchema,
  idParamSchema,
  nearbyHospitalsQuerySchema,
  updateEmergencyContactSchema,
} from '../validators/schemas.js';

const router = Router();

router.get(
  '/hospitals',
  optionalJWT,
  validateQuery(nearbyHospitalsQuerySchema),
  async (req, res, next) => {
    try {
      const { lat, lng, radius } = (req as any).query as {
        lat: number;
        lng: number;
        radius: number;
      };
      const result = await findNearbyHospitals(Number(lat), Number(lng), Number(radius));
      return sendSuccess(res, result, result.notice);
    } catch (err) {
      next(err);
    }
  }
);

router.get('/contacts', authenticateJWT, (req, res, next) => {
  try {
    const contacts = listEmergencyContacts(getDb(), req.user!.userId);
    return sendSuccess(res, { contacts }, 'Emergency contacts retrieved');
  } catch (err) {
    next(err);
  }
});

router.post(
  '/contacts',
  authenticateJWT,
  writeRateLimiter,
  validateBody(createEmergencyContactSchema),
  (req, res, next) => {
    try {
      const contact = createEmergencyContact(getDb(), req.user!.userId, req.body);
      return sendSuccess(res, { contact }, 'Emergency contact saved', 201);
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/contacts/:id',
  authenticateJWT,
  validateParams(idParamSchema),
  validateBody(updateEmergencyContactSchema),
  (req, res, next) => {
    try {
      const contact = updateEmergencyContact(
        getDb(),
        req.user!.userId,
        req.params.id,
        req.body
      );
      return sendSuccess(res, { contact }, 'Emergency contact updated');
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/contacts/:id',
  authenticateJWT,
  validateParams(idParamSchema),
  (req, res, next) => {
    try {
      deleteEmergencyContact(getDb(), req.user!.userId, req.params.id);
      return sendSuccess(res, { deleted: true }, 'Emergency contact deleted');
    } catch (err) {
      next(err);
    }
  }
);

router.get('/history', authenticateJWT, (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 40;
    const logs = listAssistanceHistory(getDb(), req.user!.userId, limit);
    return sendSuccess(res, { logs }, 'Emergency assistance history retrieved');
  } catch (err) {
    next(err);
  }
});

router.post(
  '/history',
  optionalJWT,
  writeRateLimiter,
  validateBody(createAssistanceLogSchema),
  (req, res, next) => {
    try {
      const log = recordAssistanceEvent(getDb(), req.user?.userId || null, req.body);
      return sendSuccess(res, { log }, 'Emergency assistance action logged', 201);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
