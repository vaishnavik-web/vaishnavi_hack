import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import {
  getCustomOfflineRegionBundle,
  getOfflineRegionBundle,
  listOfflineRegionPresets,
} from '../services/offlineService.js';
import { validateQuery } from '../middleware/validate.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

const customBundleQuerySchema = z.object({
  name: z.string().trim().min(2).max(100).optional().default('Custom Offline Map Area'),
  north: z.coerce.number().min(-85).max(85),
  south: z.coerce.number().min(-85).max(85),
  east: z.coerce.number().min(-180).max(180),
  west: z.coerce.number().min(-180).max(180),
  minZoom: z.coerce.number().int().min(10).max(15).optional().default(12),
  maxZoom: z.coerce.number().int().min(10).max(16).optional().default(14),
});

router.get('/regions', (_req, res, next) => {
  try {
    const regions = listOfflineRegionPresets();
    return sendSuccess(res, { regions }, 'Offline downloadable regions loaded');
  } catch (err) {
    return next(err);
  }
});

router.get('/regions/:regionId/bundle', (req, res, next) => {
  try {
    const db = getDb();
    const bundle = getOfflineRegionBundle(db, req.params.regionId);
    return sendSuccess(res, bundle, 'Offline region bundle prepared');
  } catch (err) {
    return next(err);
  }
});

router.get('/custom-bundle', validateQuery(customBundleQuerySchema), (req, res, next) => {
  try {
    const db = getDb();
    const q = (req as any).validatedQuery as z.infer<typeof customBundleQuerySchema>;
    const bundle = getCustomOfflineRegionBundle(db, q);
    return sendSuccess(res, bundle, 'Custom offline region bundle prepared');
  } catch (err) {
    return next(err);
  }
});

export default router;
