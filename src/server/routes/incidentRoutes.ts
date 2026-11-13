import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { getDb } from '../db/connection.js';
import {
  authenticateJWT,
  optionalJWT,
  requireRoles,
} from '../middleware/auth.js';
import { writeRateLimiter } from '../middleware/rateLimit.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import {
  confirmIncidentPresence,
  createIncidentReport,
  expireIncidentReport,
  getIncidentById,
  listIncidents,
  reviewIncidentStatus,
  runIncidentImpactAnalysis,
} from '../services/incidentService.js';
import { badRequest } from '../utils/errors.js';
import { sendSuccess } from '../utils/response.js';
import {
  confirmIncidentPresenceSchema,
  createIncidentSchema,
  idParamSchema,
  updateIncidentStatusSchema,
} from '../validators/schemas.js';

const uploadDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `inc-${crypto.randomUUID().slice(0, 10)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      cb(badRequest('Only JPEG, PNG, and WebP images are permitted'));
      return;
    }
    cb(null, true);
  },
});

const router = Router();

router.get('/', optionalJWT, (req, res, next) => {
  try {
    const incidents = listIncidents(
      getDb(),
      { userId: req.user?.userId, role: req.user?.role },
      {
        status: req.query.status as string | undefined,
        type: req.query.type as string | undefined,
        severity: req.query.severity as string | undefined,
        search: req.query.search as string | undefined,
        onlyDuplicates: req.query.onlyDuplicates === 'true',
        violationsOnly: req.query.violationsOnly === 'true',
        excludeExpired: req.query.excludeExpired === 'true',
      }
    );
    return sendSuccess(res, { incidents }, 'Incidents retrieved');
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  authenticateJWT,
  writeRateLimiter,
  upload.single('image'),
  validateBody(createIncidentSchema),
  (req, res, next) => {
    try {
      const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
      const incident = createIncidentReport(
        getDb(),
        { userId: req.user!.userId, email: req.user!.email },
        { ...req.body, imageUrl }
      );
      return sendSuccess(
        res,
        {
          incidentId: incident.id,
          status: incident.status,
          possibleDuplicate: incident.possibleDuplicate,
          incident,
        },
        'Incident submitted for review',
        201
      );
    } catch (err) {
      next(err);
    }
  }
);

router.get('/:id', optionalJWT, validateParams(idParamSchema), (req, res, next) => {
  try {
    const data = getIncidentById(getDb(), req.params.id, req.user?.role);
    return sendSuccess(res, data, 'Incident details retrieved');
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id/status',
  authenticateJWT,
  requireRoles('ADMIN'),
  validateParams(idParamSchema),
  validateBody(updateIncidentStatusSchema),
  (req, res, next) => {
    try {
      const updated = reviewIncidentStatus(
        getDb(),
        req.params.id,
        { userId: req.user!.userId, email: req.user!.email },
        req.body
      );
      return sendSuccess(res, { incident: updated }, `Incident marked ${updated.status}`);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/confirm',
  authenticateJWT,
  writeRateLimiter,
  validateParams(idParamSchema),
  validateBody(confirmIncidentPresenceSchema),
  (req, res, next) => {
    try {
      const result = confirmIncidentPresence(
        getDb(),
        req.params.id,
        { userId: req.user!.userId, email: req.user!.email, role: req.user!.role },
        req.body
      );
      return sendSuccess(res, result, 'Incident presence confirmation recorded');
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/:id/expire',
  authenticateJWT,
  requireRoles('ADMIN'),
  validateParams(idParamSchema),
  (req, res, next) => {
    try {
      const incident = expireIncidentReport(getDb(), req.params.id, {
        userId: req.user!.userId,
        email: req.user!.email,
      });
      return sendSuccess(res, { incident }, 'Incident report marked expired');
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/impact-analysis',
  authenticateJWT,
  requireRoles('ADMIN', 'SIGNAL_OPERATOR', 'EMERGENCY_OPERATOR'),
  validateParams(idParamSchema),
  (req, res, next) => {
    try {
      const analysis = runIncidentImpactAnalysis(getDb(), req.params.id);
      return sendSuccess(res, analysis, 'Network impact analysis completed');
    } catch (err) {
      next(err);
    }
  }
);

export default router;
