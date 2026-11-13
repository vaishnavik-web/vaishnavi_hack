import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticateJWT, optionalJWT, requireRoles } from '../middleware/auth.js';
import { writeRateLimiter } from '../middleware/rateLimit.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import {
  cancelParkingReservation,
  createParkingLocation,
  getNearbyParking,
  getParkingById,
  getParkingStatsSummary,
  listAllReservationsAdmin,
  listParkingLocations,
  listUserReservations,
  reserveParkingSlot,
  updateParkingLocation,
} from '../services/parkingService.js';
import { sendSuccess } from '../utils/response.js';
import {
  createParkingSchema,
  idParamSchema,
  reserveParkingSchema,
  updateParkingSchema,
} from '../validators/schemas.js';

const router = Router();

router.get('/', (req, res, next) => {
  try {
    const lat = req.query.lat !== undefined ? Number(req.query.lat) : undefined;
    const lng = req.query.lng !== undefined ? Number(req.query.lng) : undefined;
    const maxPrice =
      req.query.maxPrice !== undefined && req.query.maxPrice !== ''
        ? Number(req.query.maxPrice)
        : undefined;

    const locations = listParkingLocations(getDb(), {
      q: req.query.q as string | undefined,
      type: req.query.type as string | undefined,
      availability: req.query.availability as string | undefined,
      maxPrice,
      lat: lat !== undefined && !Number.isNaN(lat) ? lat : undefined,
      lng: lng !== undefined && !Number.isNaN(lng) ? lng : undefined,
      sort: req.query.sort as string | undefined,
    });
    return sendSuccess(res, { locations }, 'Parking locations retrieved');
  } catch (err) {
    next(err);
  }
});

router.get('/nearby', (req, res, next) => {
  try {
    const lat = Number(req.query.lat ?? 15.852);
    const lng = Number(req.query.lng ?? 74.501);
    const limit = Math.min(10, Math.max(1, Number(req.query.limit ?? 4)));
    const locations = getNearbyParking(getDb(), lat, lng, limit);
    return sendSuccess(res, { locations }, 'Nearby parking locations retrieved');
  } catch (err) {
    next(err);
  }
});

router.get('/reservations/me', authenticateJWT, (req, res, next) => {
  try {
    const reservations = listUserReservations(getDb(), req.user!.userId);
    return sendSuccess(res, { reservations }, 'User parking reservations retrieved');
  } catch (err) {
    next(err);
  }
});

router.get(
  '/admin/reservations',
  authenticateJWT,
  requireRoles('ADMIN'),
  (_req, res, next) => {
    try {
      const db = getDb();
      const reservations = listAllReservationsAdmin(db);
      const stats = getParkingStatsSummary(db);
      return sendSuccess(res, { reservations, stats }, 'All parking reservations retrieved');
    } catch (err) {
      next(err);
    }
  }
);

router.get('/:id', optionalJWT, validateParams(idParamSchema), (req, res, next) => {
  try {
    const lat = req.query.lat !== undefined ? Number(req.query.lat) : undefined;
    const lng = req.query.lng !== undefined ? Number(req.query.lng) : undefined;
    const detail = getParkingById(
      getDb(),
      req.params.id,
      req.user?.userId,
      lat !== undefined && !Number.isNaN(lat) ? lat : undefined,
      lng !== undefined && !Number.isNaN(lng) ? lng : undefined
    );
    return sendSuccess(res, detail, 'Parking location details retrieved');
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/reserve',
  authenticateJWT,
  writeRateLimiter,
  validateParams(idParamSchema),
  validateBody(reserveParkingSchema),
  (req, res, next) => {
    try {
      const result = reserveParkingSlot(
        getDb(),
        req.params.id,
        { userId: req.user!.userId, email: req.user!.email },
        req.body
      );
      return sendSuccess(res, result, 'Parking slot reserved', 201);
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/reservations/:id/cancel',
  authenticateJWT,
  validateParams(idParamSchema),
  (req, res, next) => {
    try {
      const result = cancelParkingReservation(getDb(), req.params.id, {
        userId: req.user!.userId,
        email: req.user!.email,
        role: req.user!.role,
      });
      return sendSuccess(res, result, 'Parking reservation cancelled');
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/',
  authenticateJWT,
  requireRoles('ADMIN'),
  validateBody(createParkingSchema),
  (req, res, next) => {
    try {
      const location = createParkingLocation(
        getDb(),
        { userId: req.user!.userId, email: req.user!.email },
        req.body
      );
      return sendSuccess(res, { location }, 'Parking location created', 201);
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/:id',
  authenticateJWT,
  requireRoles('ADMIN'),
  validateParams(idParamSchema),
  validateBody(updateParkingSchema),
  (req, res, next) => {
    try {
      const location = updateParkingLocation(
        getDb(),
        req.params.id,
        { userId: req.user!.userId, email: req.user!.email },
        req.body
      );
      return sendSuccess(res, { location }, 'Parking location updated');
    } catch (err) {
      next(err);
    }
  }
);

export default router;
