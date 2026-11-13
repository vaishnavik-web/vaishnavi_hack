import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticateJWT, requireRoles } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import {
  createBusRoute,
  createBusSchedule,
  createBusStop,
  getBusRouteById,
  getBusStopDetails,
  listBusRoutes,
  listBusStops,
  planPublicTransportJourney,
  removeBusRouteStop,
  updateBusRoute,
  updateBusSchedule,
  updateBusStop,
  upsertBusRouteStop,
} from '../services/transportService.js';
import { sendSuccess } from '../utils/response.js';
import {
  createBusRouteSchema,
  createBusScheduleSchema,
  createBusStopSchema,
  idParamSchema,
  updateBusRouteSchema,
  updateBusScheduleSchema,
  updateBusStopSchema,
  upsertBusRouteStopSchema,
} from '../validators/schemas.js';

const router = Router();

router.get('/stops', (req, res, next) => {
  try {
    const lat = req.query.lat !== undefined ? Number(req.query.lat) : undefined;
    const lng = req.query.lng !== undefined ? Number(req.query.lng) : undefined;
    const stops = listBusStops(getDb(), {
      q: req.query.q as string | undefined,
      lat: lat !== undefined && !Number.isNaN(lat) ? lat : undefined,
      lng: lng !== undefined && !Number.isNaN(lng) ? lng : undefined,
    });
    return sendSuccess(res, { stops }, 'Bus stops retrieved');
  } catch (err) {
    next(err);
  }
});

router.get('/stops/:id', validateParams(idParamSchema), (req, res, next) => {
  try {
    const details = getBusStopDetails(getDb(), req.params.id);
    return sendSuccess(res, details, 'Bus stop details retrieved');
  } catch (err) {
    next(err);
  }
});

router.get('/routes', (req, res, next) => {
  try {
    const routes = listBusRoutes(getDb(), {
      q: req.query.q as string | undefined,
      status: req.query.status as string | undefined,
    });
    return sendSuccess(res, { routes }, 'Bus routes retrieved');
  } catch (err) {
    next(err);
  }
});

router.get('/routes/:id', validateParams(idParamSchema), (req, res, next) => {
  try {
    const route = getBusRouteById(getDb(), req.params.id);
    return sendSuccess(res, { route }, 'Bus route details retrieved');
  } catch (err) {
    next(err);
  }
});

router.get('/plan', (req, res, next) => {
  try {
    const originLat = req.query.originLat !== undefined ? Number(req.query.originLat) : undefined;
    const originLng = req.query.originLng !== undefined ? Number(req.query.originLng) : undefined;
    const destLat = req.query.destLat !== undefined ? Number(req.query.destLat) : undefined;
    const destLng = req.query.destLng !== undefined ? Number(req.query.destLng) : undefined;

    const plan = planPublicTransportJourney(getDb(), {
      originStopId: req.query.originStopId as string | undefined,
      originLat: originLat !== undefined && !Number.isNaN(originLat) ? originLat : undefined,
      originLng: originLng !== undefined && !Number.isNaN(originLng) ? originLng : undefined,
      originQuery: req.query.originQuery as string | undefined,
      destStopId: req.query.destStopId as string | undefined,
      destLat: destLat !== undefined && !Number.isNaN(destLat) ? destLat : undefined,
      destLng: destLng !== undefined && !Number.isNaN(destLng) ? destLng : undefined,
      destQuery: req.query.destQuery as string | undefined,
    });
    return sendSuccess(res, plan, 'Public transport journey options computed');
  } catch (err) {
    next(err);
  }
});

// Admin Transport Management
router.post(
  '/stops',
  authenticateJWT,
  requireRoles('ADMIN'),
  validateBody(createBusStopSchema),
  (req, res, next) => {
    try {
      const stop = createBusStop(
        getDb(),
        { userId: req.user!.userId, email: req.user!.email },
        req.body
      );
      return sendSuccess(res, { stop }, 'Bus stop created', 201);
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/stops/:id',
  authenticateJWT,
  requireRoles('ADMIN'),
  validateParams(idParamSchema),
  validateBody(updateBusStopSchema),
  (req, res, next) => {
    try {
      const stop = updateBusStop(
        getDb(),
        req.params.id,
        { userId: req.user!.userId, email: req.user!.email },
        req.body
      );
      return sendSuccess(res, { stop }, 'Bus stop updated');
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/routes',
  authenticateJWT,
  requireRoles('ADMIN'),
  validateBody(createBusRouteSchema),
  (req, res, next) => {
    try {
      const route = createBusRoute(
        getDb(),
        { userId: req.user!.userId, email: req.user!.email },
        req.body
      );
      return sendSuccess(res, { route }, 'Bus route created', 201);
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/routes/:id',
  authenticateJWT,
  requireRoles('ADMIN'),
  validateParams(idParamSchema),
  validateBody(updateBusRouteSchema),
  (req, res, next) => {
    try {
      const route = updateBusRoute(
        getDb(),
        req.params.id,
        { userId: req.user!.userId, email: req.user!.email },
        req.body
      );
      return sendSuccess(res, { route }, 'Bus route updated');
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/routes/:id/stops',
  authenticateJWT,
  requireRoles('ADMIN'),
  validateParams(idParamSchema),
  validateBody(upsertBusRouteStopSchema),
  (req, res, next) => {
    try {
      const route = upsertBusRouteStop(
        getDb(),
        req.params.id,
        { userId: req.user!.userId, email: req.user!.email },
        req.body
      );
      return sendSuccess(res, { route }, 'Bus route stop assigned');
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/routes/:id/stops/:stopId',
  authenticateJWT,
  requireRoles('ADMIN'),
  (req, res, next) => {
    try {
      const route = removeBusRouteStop(getDb(), req.params.id, req.params.stopId, {
        userId: req.user!.userId,
        email: req.user!.email,
      });
      return sendSuccess(res, { route }, 'Stop removed from bus route');
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/schedules',
  authenticateJWT,
  requireRoles('ADMIN'),
  validateBody(createBusScheduleSchema),
  (req, res, next) => {
    try {
      const schedule = createBusSchedule(
        getDb(),
        { userId: req.user!.userId, email: req.user!.email },
        req.body
      );
      return sendSuccess(res, { schedule }, 'Bus schedule created', 201);
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/schedules/:id',
  authenticateJWT,
  requireRoles('ADMIN'),
  validateParams(idParamSchema),
  validateBody(updateBusScheduleSchema),
  (req, res, next) => {
    try {
      const schedule = updateBusSchedule(
        getDb(),
        req.params.id,
        { userId: req.user!.userId, email: req.user!.email },
        req.body
      );
      return sendSuccess(res, { schedule }, 'Bus schedule updated');
    } catch (err) {
      next(err);
    }
  }
);

export default router;
