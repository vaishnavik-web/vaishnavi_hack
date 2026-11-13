import http from 'http';
import { beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient } from 'socket.io-client';
import request from 'supertest';
import { resetDbForTests } from '../src/server/db/connection.js';
import { createApp } from '../src/server/app.js';
import { initSocketServer } from '../src/server/realtime/socket.js';
import {
  formatNavigationInstruction,
  getNavigationPhrase,
  haversineDistanceMeters,
  minDistanceToRouteMeters,
  parseVoiceSearchQuery,
} from '../src/utils/voiceNavigation.js';

describe('TRAFFIX Full-Stack API & Algorithms Acceptance Suite', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.VITEST = 'true';
    resetDbForTests();
    app = createApp();
  });

  async function loginAs(email: string, password: string): Promise<string> {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    return res.body.data.accessToken;
  }

  it('returns healthy status and OpenAPI docs', async () => {
    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body.success).toBe(true);
    expect(health.body.data.nodesCount).toBe(16);
    expect(health.body.data.segmentsCount).toBe(28);

    const docs = await request(app).get('/api/docs');
    expect(docs.status).toBe(200);
    expect(docs.body.data.openapi).toBe('3.0.3');
  });

  it('registers a user, logs in, retrieves profile, and rejects invalid credentials', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      name: 'Test Commuter',
      email: 'newuser@traffix.test',
      password: 'Password123',
      role: 'COMMUTER',
    });
    expect(reg.status).toBe(201);
    expect(reg.body.data.accessToken).toBeTruthy();

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${reg.body.data.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe('newuser@traffix.test');

    const badLogin = await request(app).post('/api/auth/login').send({
      email: 'newuser@traffix.test',
      password: 'WrongPassword1',
    });
    expect(badLogin.status).toBe(401);
  });

  it('denies normal commuter access to admin-only endpoints', async () => {
    const commuterToken = await loginAs('commuter@traffix.demo', 'DemoPass!123');

    const auditRes = await request(app)
      .get('/api/analytics/audit-logs')
      .set('Authorization', `Bearer ${commuterToken}`);
    expect(auditRes.status).toBe(403);

    const reviewRes = await request(app)
      .patch('/api/incidents/inc-seed-2/status')
      .set('Authorization', `Bearer ${commuterToken}`)
      .send({ status: 'VERIFIED' });
    expect(reviewRes.status).toBe(403);
  });

  it('rejects invalid incident forms and persists valid incidents with duplicate detection', async () => {
    const commuterToken = await loginAs('commuter@traffix.demo', 'DemoPass!123');

    // Invalid coordinates & short description
    const invalid = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${commuterToken}`)
      .send({
        type: 'ACCIDENT',
        description: 'bad',
        latitude: 240,
        longitude: 74.5,
        severity: 'HIGH',
      });
    expect(invalid.status).toBe(400);

    // Valid incident
    const valid = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${commuterToken}`)
      .send({
        type: 'ACCIDENT',
        description: 'Two vehicles collided near Fort Lake entrance blocking eastbound lane',
        latitude: 15.864,
        longitude: 74.513,
        severity: 'HIGH',
        roadSegmentId: 'seg-15',
      });
    expect(valid.status).toBe(201);
    expect(valid.body.data.status).toBe('PENDING');
    const createdId = valid.body.data.incidentId;

    // Nearby duplicate submission
    const dup = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${commuterToken}`)
      .send({
        type: 'ACCIDENT',
        description: 'Collision near Fort Lake entrance blocking eastbound lane',
        latitude: 15.8641,
        longitude: 74.5131,
        severity: 'HIGH',
        roadSegmentId: 'seg-15',
      });
    expect(dup.status).toBe(201);
    expect(dup.body.data.possibleDuplicate).toBe(true);
    expect(dup.body.data.incident.canonicalIncidentId).toBe(createdId);
  });

  it('computes distinct shortest vs fastest routes and reroutes around verified/simulated closures', async () => {
    const routesRes = await request(app).get('/api/routes/alternatives').query({
      originNodeId: 'node-tilakwadi',
      destinationNodeId: 'node-kle',
    });
    expect(routesRes.status).toBe(200);
    const alts = routesRes.body.data.alternatives;
    const shortest = alts.find((a: any) => a.category === 'SHORTEST');
    const fastest = alts.find((a: any) => a.category === 'FASTEST');
    expect(shortest).toBeTruthy();
    expect(fastest).toBeTruthy();

    // Verify shortest distance differs from fastest time path
    expect(shortest.pathSegmentIds).not.toEqual(fastest.pathSegmentIds);
    expect(shortest.totalDistanceKm).toBeLessThanOrEqual(fastest.totalDistanceKm);
    expect(fastest.estimatedTimeMin).toBeLessThanOrEqual(shortest.estimatedTimeMin);

    // Start non-destructive full closure simulation on fastest route's first non-shared segment
    const adminToken = await loginAs('admin@traffix.demo', 'AdminPass!123');
    const targetSeg = fastest.pathSegmentIds[0];
    const simRes = await request(app)
      .post('/api/simulations/closures')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Bypass Closure Test',
        type: 'FULL_CLOSURE',
        targetSegmentId: targetSeg,
        originNodeId: 'node-tilakwadi',
        destinationNodeId: 'node-kle',
      });
    expect(simRes.status).toBe(201);
    const simId = simRes.body.data.scenario.id;

    // Route calculation now excludes targetSeg
    const reroutedRes = await request(app).get('/api/routes/alternatives').query({
      originNodeId: 'node-tilakwadi',
      destinationNodeId: 'node-kle',
    });
    expect(reroutedRes.status).toBe(200);
    for (const alt of reroutedRes.body.data.alternatives) {
      expect(alt.pathSegmentIds).not.toContain(targetSeg);
    }

    // End simulation restores original network
    const endRes = await request(app)
      .post(`/api/simulations/${simId}/end`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(endRes.status).toBe(200);
    expect(endRes.body.data.scenario.status).toBe('ENDED');
  });

  it('runs 15/30-minute predictions, adaptive signal optimization, and emergency priority routing', async () => {
    const adminToken = await loginAs('admin@traffix.demo', 'AdminPass!123');
    const signalToken = await loginAs('signal@traffix.demo', 'SignalPass!123');
    const emergToken = await loginAs('emergency@traffix.demo', 'EmergPass!123');

    // Predictions
    const predRun = await request(app)
      .post('/api/predictions/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ weatherCondition: 'RAIN', densityMultiplier: 1.1 });
    expect(predRun.status).toBe(201);
    expect(predRun.body.data.predictions.length).toBeGreaterThan(20);
    expect(predRun.body.data.predictions[0].isSimulated).toBe(true);

    // Adaptive Signal Optimization
    const sigRes = await request(app)
      .post('/api/signals/optimize')
      .set('Authorization', `Bearer ${signalToken}`)
      .send({
        junctionId: 'junc-chennamma',
        observedDensity: 0.82,
        observedQueue: 28,
      });
    expect(sigRes.status).toBe(201);
    const plan = sigRes.body.data.plan;
    for (const ph of plan.proposedTimings) {
      expect(ph.greenSec).toBeGreaterThanOrEqual(15);
      expect(ph.greenSec).toBeLessThanOrEqual(75);
    }
    expect(plan.afterMetrics.avgWaitTimeSec).toBeLessThanOrEqual(
      plan.beforeMetrics.avgWaitTimeSec + 5
    );

    // Emergency Priority Routing
    const emgRes = await request(app)
      .post('/api/emergency/trips')
      .set('Authorization', `Bearer ${emergToken}`)
      .send({
        vehicleId: 'veh-amb-01',
        originNodeId: 'node-tilakwadi',
        destinationNodeId: 'node-kle',
        priorityLevel: 'CRITICAL_CODE_3',
      });
    expect(emgRes.status).toBe(201);
    const trip = emgRes.body.data.trip;
    expect(trip.priorityEtaMin).toBeLessThan(trip.normalEtaMin);
    expect(trip.timeSavedMin).toBeGreaterThan(0);
    expect(trip.junctionActions.length).toBeGreaterThan(0);
  });

  it('supports geocode, reverse-geocode, Google Routes coordinate routing, POST /routes/evaluate, and local graph fallback', async () => {
    const commuterToken = await loginAs('commuter@traffix.demo', 'DemoPass!123');

    // Geocode local corridor & coordinates
    const geoRes = await request(app).get('/api/routes/geocode').query({ q: 'KLE' });
    expect(geoRes.status).toBe(200);
    expect(geoRes.body.data.results.length).toBeGreaterThan(0);

    const revRes = await request(app)
      .get('/api/routes/reverse-geocode')
      .query({ lat: 15.853, lng: 74.502 });
    expect(revRes.status).toBe(200);
    expect(revRes.body.data.label).toBeTruthy();

    // Reject identical coordinates
    const sameRes = await request(app).get('/api/routes/alternatives').query({
      originLat: 15.853,
      originLng: 74.502,
      destinationLat: 15.853,
      destinationLng: 74.502,
    });
    expect(sameRes.status).toBe(400);

    // Test local graph fallback when external Google routing is off in unit test mode
    const fallbackRes = await request(app).get('/api/routes/alternatives').query({
      originLat: 15.8399,
      originLng: 74.4893,
      originLabel: 'Custom Tilakwadi Start',
      destinationLat: 15.8697,
      destinationLng: 74.5137,
      destinationLabel: 'Custom KLE Dest',
    });
    expect(fallbackRes.status).toBe(200);
    expect(fallbackRes.body.data.provider.mode).toBe('LIVE_FALLBACK_SIMULATED');
    expect(fallbackRes.body.data.alternatives.length).toBeGreaterThanOrEqual(2);

    // Save custom coordinate route
    const saveRes = await request(app)
      .post('/api/routes/saved')
      .set('Authorization', `Bearer ${commuterToken}`)
      .send({
        label: 'Custom Pin Commute',
        originLat: 15.8399,
        originLng: 74.4893,
        destinationLat: 15.8697,
        destinationLng: 74.5137,
        routeType: 'RECOMMENDED',
        summary: {
          distanceKm: 4.5,
          etaMin: 9.2,
          originLat: 15.8399,
          originLng: 74.4893,
          originLabel: 'Custom Tilakwadi Start',
          destinationLat: 15.8697,
          destinationLng: 74.5137,
          destinationLabel: 'Custom KLE Dest',
        },
      });
    expect(saveRes.status).toBe(201);

    // Test Google Routes API v2 coordinate routing with mocked response verifying encodedPolyline decoding & multi-factor ranking
    const origFetch = globalThis.fetch;
    process.env.TRAFFIX_TEST_FETCH = 'true';
    // Encodes [[15.8399, 74.4893], [15.8548, 74.5015], [15.8697, 74.5137]]
    const encodedPrimary = 'kvt_BcuseMc|AgkAc|AgkA';
    // Encodes [[15.8399, 74.4893], [15.8620, 74.4920], [15.8697, 74.5137]]
    const encodedAlt = 'kvt_BcuseMciC{Oco@sfC';
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          routes: [
            {
              distanceMeters: 4200,
              duration: '540s',
              description: 'College Road',
              polyline: { encodedPolyline: encodedPrimary },
              legs: [
                {
                  steps: [
                    {
                      distanceMeters: 4200,
                      staticDuration: '540s',
                      navigationInstruction: {
                        maneuver: 'DEPART',
                        instructions: 'Head northeast on College Road',
                      },
                      startLocation: { latLng: { latitude: 15.8399, longitude: 74.4893 } },
                    },
                    {
                      distanceMeters: 0,
                      staticDuration: '0s',
                      navigationInstruction: {
                        maneuver: 'ARRIVE',
                        instructions: 'Arrive at Nehru Nagar Main',
                      },
                      startLocation: { latLng: { latitude: 15.8697, longitude: 74.5137 } },
                    },
                  ],
                },
              ],
            },
            {
              distanceMeters: 5100,
              duration: '480s',
              description: 'Bypass Ring Road',
              polyline: { encodedPolyline: encodedAlt },
              legs: [
                {
                  steps: [
                    {
                      distanceMeters: 5100,
                      staticDuration: '480s',
                      navigationInstruction: {
                        maneuver: 'DEPART',
                        instructions: 'Head north on Bypass Ring Road',
                      },
                      startLocation: { latLng: { latitude: 15.8399, longitude: 74.4893 } },
                    },
                  ],
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )) as any;

    try {
      const googleRes = await request(app).get('/api/routes/alternatives').query({
        originLat: 15.83991,
        originLng: 74.48931,
        destinationLat: 15.86971,
        destinationLng: 74.51371,
      });
      expect(googleRes.status).toBe(200);
      expect(googleRes.body.data.provider.mode).toBe('GOOGLE_ROUTES_WITH_SIMULATED_TRAFFIC');
      const rec = googleRes.body.data.alternatives.find((a: any) => a.category === 'RECOMMENDED');
      expect(rec).toBeTruthy();
      expect(rec.isRecommended).toBe(true);
      expect(rec.geometry[0][0]).toBeCloseTo(15.8399, 3);
      expect(rec.geometry[0][1]).toBeCloseTo(74.4893, 3);
      expect(rec.importantTurns.length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = origFetch;
      delete process.env.TRAFFIX_TEST_FETCH;
    }

    // Test POST /api/routes/evaluate for client-side Google Maps Routes JS SDK candidates
    const evalRes = await request(app)
      .post('/api/routes/evaluate')
      .send({
        originLat: 15.8399,
        originLng: 74.4893,
        originLabel: 'Tilakwadi',
        destinationLat: 15.8697,
        destinationLng: 74.5137,
        destinationLabel: 'KLE Hospital',
        candidates: [
          {
            distanceMeters: 4200,
            durationSeconds: 540,
            summary: 'Google Route Primary',
            geometry: [
              [15.8399, 74.4893],
              [15.8548, 74.5015],
              [15.8697, 74.5137],
            ],
            steps: [
              {
                instruction: 'Head northeast on College Road',
                name: 'DEPART',
                distanceMeters: 4200,
                durationSec: 540,
                latitude: 15.8399,
                longitude: 74.4893,
              },
            ],
          },
          {
            distanceMeters: 5100,
            durationSeconds: 480,
            summary: 'Google Route Bypass',
            geometry: [
              [15.8399, 74.4893],
              [15.862, 74.492],
              [15.8697, 74.5137],
            ],
          },
        ],
      });
    expect(evalRes.status).toBe(200);
    expect(evalRes.body.data.provider.mode).toBe('GOOGLE_ROUTES_WITH_SIMULATED_TRAFFIC');
    expect(evalRes.body.data.alternatives.length).toBe(2);
    expect(evalRes.body.data.alternatives[0].category).toBe('RECOMMENDED');
  });

  it('aggregates historical traffic metrics across time intervals and preserves RBAC on /analytics/overview', async () => {
    const res24h = await request(app)
      .get('/api/analytics/historical')
      .query({ window: '24H', bucketHours: 2 });
    expect(res24h.status).toBe(200);
    expect(res24h.body.data.window).toBe('24H');
    expect(res24h.body.data.bucketHours).toBe(2);
    expect(res24h.body.data.summary.isSimulated).toBe(true);
    expect(res24h.body.data.summary.totalObservations).toBeGreaterThan(200);
    expect(res24h.body.data.summary.avgTravelTimeMin).toBeGreaterThan(0);
    expect(res24h.body.data.summary.avgCongestionPct).toBeGreaterThan(0);
    expect(res24h.body.data.series.length).toBeGreaterThanOrEqual(6);
    expect(res24h.body.data.topCorridors.length).toBeGreaterThan(0);
    expect(res24h.body.data.availableSegments.length).toBe(28);

    const res12h4h = await request(app)
      .get('/api/analytics/historical')
      .query({ window: '12H', bucketHours: 4 });
    expect(res12h4h.status).toBe(200);
    expect(res12h4h.body.data.window).toBe('12H');
    expect(res12h4h.body.data.bucketHours).toBe(4);
    expect(res12h4h.body.data.series.length).toBeGreaterThanOrEqual(2);
    expect(res12h4h.body.data.series.length).toBeLessThanOrEqual(4);

    const resSeg = await request(app)
      .get('/api/analytics/historical')
      .query({ window: '6H', bucketHours: 2, segmentId: 'seg-01' });
    expect(resSeg.status).toBe(200);
    expect(resSeg.body.data.selectedSegmentId).toBe('seg-01');
    expect(resSeg.body.data.topCorridors.length).toBe(1);
    expect(resSeg.body.data.topCorridors[0].segmentId).toBe('seg-01');

    // Verify existing RBAC on /api/analytics/overview remains strictly enforced
    const commuterToken = await loginAs('commuter@traffix.demo', 'DemoPass!123');
    const forbiddenOverview = await request(app)
      .get('/api/analytics/overview')
      .set('Authorization', `Bearer ${commuterToken}`);
    expect(forbiddenOverview.status).toBe(403);

    const adminToken = await loginAs('admin@traffix.demo', 'AdminPass!123');
    const adminOverview = await request(app)
      .get('/api/analytics/overview')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminOverview.status).toBe(200);
    expect(adminOverview.body.data.networkSummary.totalSegments).toBe(28);
  });

  it('broadcasts low-latency WebSocket notifications on incident reporting, verification, and closure simulations', async () => {
    const server = http.createServer(app);
    initSocketServer(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const client = ioClient(baseUrl, { transports: ['websocket'] });
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', reject);
    });

    const receivedReported: any[] = [];
    const receivedVerified: any[] = [];
    const receivedRoadStatus: any[] = [];
    client.on('incident:reported', (msg) => receivedReported.push(msg));
    client.on('incident:verified', (msg) => receivedVerified.push(msg));
    client.on('road:status-changed', (msg) => receivedRoadStatus.push(msg));

    try {
      const commuterToken = await loginAs('commuter@traffix.demo', 'DemoPass!123');
      const adminToken = await loginAs('admin@traffix.demo', 'AdminPass!123');

      const postRes = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${commuterToken}`)
        .send({
          type: 'ROADBLOCK',
          description: 'Live simulation obstruction reported near Tilakwadi crossing',
          latitude: 15.8402,
          longitude: 74.4895,
          severity: 'HIGH',
          roadSegmentId: 'seg-01',
        });
      expect(postRes.status).toBe(201);
      const incidentId = postRes.body.data.incidentId;

      await new Promise((r) => setTimeout(r, 150));
      expect(receivedReported.length).toBeGreaterThanOrEqual(1);
      const reportedEvent = receivedReported.find((e) => e?.payload?.id === incidentId);
      expect(reportedEvent).toBeTruthy();
      expect(reportedEvent.payload.reporterId).toBeUndefined();
      expect(reportedEvent.payload.roadSegmentId).toBe('seg-01');

      const verifyRes = await request(app)
        .patch(`/api/incidents/${incidentId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'VERIFIED' });
      expect(verifyRes.status).toBe(200);

      const simRes = await request(app)
        .post('/api/simulations/closures')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'WS Live Test Closure',
          type: 'LANE_BLOCKAGE',
          targetSegmentId: 'seg-02',
        });
      expect(simRes.status).toBe(201);

      await new Promise((r) => setTimeout(r, 150));
      expect(receivedVerified.some((e) => e?.payload?.id === incidentId)).toBe(true);
      expect(
        receivedRoadStatus.some(
          (e) =>
            e?.payload?.simulationId === simRes.body.data.scenario.id &&
            e?.payload?.segmentName
        )
      ).toBe(true);
    } finally {
      client.disconnect();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('verifies all 5 core features react dynamically to traffic conditions, weather, demand, closures, and weights', async () => {
    const commuterToken = await loginAs('commuter@traffix.demo', 'DemoPass!123');
    const adminToken = await loginAs('admin@traffix.demo', 'AdminPass!123');
    const signalToken = await loginAs('signal@traffix.demo', 'SignalPass!123');
    const emergToken = await loginAs('emergency@traffix.demo', 'EmergPass!123');

    // Feature 1: Predictions respond to weather & density, classify LOW/MEDIUM/HIGH, and recommend pre-congestion bypasses
    await request(app)
      .post('/api/predictions/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ weatherCondition: 'CLEAR', densityMultiplier: 0.7 });
    const clearPreds = await request(app).get('/api/predictions').query({ horizon: 15 });
    expect(clearPreds.status).toBe(200);
    const clearTop = clearPreds.body.data.predictions[0];

    await request(app)
      .post('/api/predictions/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ weatherCondition: 'HEAVY_RAIN', densityMultiplier: 1.35 });
    const rainPreds30 = await request(app).get('/api/predictions').query({ horizon: 30 });
    expect(rainPreds30.status).toBe(200);
    const rainMatch = rainPreds30.body.data.predictions.find(
      (p: any) => p.segmentId === clearTop.segmentId
    );
    expect(rainMatch.predictedDensity).toBeGreaterThan(clearTop.predictedDensity);
    expect(rainMatch.riskScore).toBeGreaterThan(clearTop.riskScore);
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(rainMatch.riskLevel);
    const highRiskPred = rainPreds30.body.data.predictions.find(
      (p: any) => p.riskLevel === 'HIGH' && p.recommendedAlternative
    );
    expect(highRiskPred).toBeTruthy();
    expect(highRiskPred.recommendedAlternative.detourSegmentNames.length).toBeGreaterThan(0);

    // Feature 2: Incident severity rules, graph impact BFS, and recommended diversions
    const incRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${commuterToken}`)
      .send({
        type: 'ROADBLOCK',
        description: 'Multi-vehicle pileup blocking both eastbound lanes at Khade Bazaar',
        latitude: 15.8552,
        longitude: 74.5027,
        severity: 'CRITICAL',
        roadSegmentId: 'seg-01',
      });
    expect(incRes.status).toBe(201);
    expect(incRes.body.data.incident.severityReasons.length).toBeGreaterThan(0);
    const incId = incRes.body.data.incidentId;

    const impactRes = await request(app)
      .post(`/api/incidents/${incId}/impact-analysis`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(impactRes.status).toBe(200);
    expect(impactRes.body.data.downstreamSegments.length).toBeGreaterThan(0);
    expect(impactRes.body.data.alternativeDetours.length).toBeGreaterThan(0);
    expect(impactRes.body.data.networkConnectivityIntact).toBe(true);

    // Feature 3: Adaptive signal optimization changes timings when density/queue change, respects bounds, and approves plan
    const lowDemandSig = await request(app)
      .post('/api/signals/optimize')
      .set('Authorization', `Bearer ${signalToken}`)
      .send({ junctionId: 'junc-chennamma', observedDensity: 0.25, observedQueue: 5 });
    expect(lowDemandSig.status).toBe(201);

    const highDemandSig = await request(app)
      .post('/api/signals/optimize')
      .set('Authorization', `Bearer ${signalToken}`)
      .send({ junctionId: 'junc-chennamma', observedDensity: 0.9, observedQueue: 34 });
    expect(highDemandSig.status).toBe(201);
    const lowP1 = lowDemandSig.body.data.plan.proposedTimings[0].greenSec;
    const highP1 = highDemandSig.body.data.plan.proposedTimings[0].greenSec;
    expect(highP1).toBeGreaterThan(lowP1);
    for (const ph of highDemandSig.body.data.plan.proposedTimings) {
      expect(ph.greenSec).toBeGreaterThanOrEqual(15);
      expect(ph.greenSec).toBeLessThanOrEqual(75);
    }

    const approveSig = await request(app)
      .post(`/api/signals/plans/${highDemandSig.body.data.plan.id}/approve`)
      .set('Authorization', `Bearer ${signalToken}`);
    expect(approveSig.status).toBe(200);
    expect(approveSig.body.data.plan.status).toBe('APPROVED_SIMULATION');

    // Feature 4: Emergency Fire Truck priority routing with normalRoute comparison & closure recalculation
    const fireRes = await request(app)
      .post('/api/emergency/trips')
      .set('Authorization', `Bearer ${emergToken}`)
      .send({
        vehicleId: 'veh-fire-02',
        originNodeId: 'node-camp',
        destinationNodeId: 'node-kle',
        priorityLevel: 'CRITICAL_CODE_3',
      });
    expect(fireRes.status).toBe(201);
    const fireTrip = fireRes.body.data.trip;
    expect(fireTrip.vehicleType).toBe('FIRE_TRUCK');
    expect(fireTrip.route.normalRoute).toBeTruthy();
    expect(fireTrip.route.normalRoute.geometry.length).toBeGreaterThan(1);
    expect(fireTrip.priorityEtaMin).toBeLessThan(fireTrip.normalEtaMin);

    const closureTarget = fireTrip.route.pathSegmentIds[0];
    const simClosure = await request(app)
      .post('/api/simulations/closures')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Emergency Detour Closure',
        type: 'FULL_CLOSURE',
        targetSegmentId: closureTarget,
      });
    expect(simClosure.status).toBe(201);

    const recalcRes = await request(app)
      .post(`/api/emergency/trips/${fireTrip.id}/priority-route`)
      .set('Authorization', `Bearer ${emergToken}`);
    expect(recalcRes.status).toBe(200);
    expect(recalcRes.body.data.trip.route.pathSegmentIds).not.toContain(closureTarget);

    // Feature 5: Multi-factor routing weights alter composite scores and produce SHORTEST, FASTEST, RECOMMENDED
    const routeDefault = await request(app).get('/api/routes/alternatives').query({
      originNodeId: 'node-tilakwadi',
      destinationNodeId: 'node-kle',
    });
    expect(routeDefault.status).toBe(200);
    expect(routeDefault.body.data.alternatives.length).toBe(3);
    const recDefault = routeDefault.body.data.alternatives.find(
      (a: any) => a.category === 'RECOMMENDED'
    );
    expect(recDefault.estimatedFuelLiters).toBeGreaterThan(0);
    expect(recDefault.reliabilityScore).toBeGreaterThan(0);

    const routeWeighted = await request(app).get('/api/routes/alternatives').query({
      originNodeId: 'node-tilakwadi',
      destinationNodeId: 'node-kle',
      distanceWeight: 0.55,
      timeWeight: 0.1,
      congestionWeight: 0.05,
      incidentWeight: 0.05,
    });
    expect(routeWeighted.status).toBe(200);
    const recWeighted = routeWeighted.body.data.alternatives.find(
      (a: any) => a.category === 'RECOMMENDED'
    );
    expect(recWeighted.scoreBreakdown.totalCompositeScore).not.toBe(
      recDefault.scoreBreakdown.totalCompositeScore
    );
  });

  it('supports wrong-way & illegal parking reporting, Still Present confirmations, expiry lifecycle, and route warnings', async () => {
    const commuterToken = await loginAs('commuter@traffix.demo', 'DemoPass!123');
    const adminToken = await loginAs('admin@traffix.demo', 'AdminPass!123');

    // Create WRONG_WAY_DRIVING report with roadName, landmark, occurredAt
    const violRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${commuterToken}`)
      .send({
        type: 'WRONG_WAY_DRIVING',
        description: 'Heavy wrong-way two-wheeler flow entering opposite carriageway',
        latitude: 15.855,
        longitude: 74.497,
        roadName: 'College Road',
        landmark: 'Near Lingaraj College Gate',
        occurredAt: new Date().toISOString(),
        severity: 'HIGH',
        roadSegmentId: 'seg-03',
      });
    expect(violRes.status).toBe(201);
    const violId = violRes.body.data.incidentId;
    expect(violRes.body.data.incident.roadName).toBe('College Road');
    expect(violRes.body.data.incident.landmark).toBe('Near Lingaraj College Gate');

    // Filter violationsOnly (authenticated commuter sees own PENDING report)
    const violListRes = await request(app)
      .get('/api/incidents')
      .set('Authorization', `Bearer ${commuterToken}`)
      .query({ violationsOnly: 'true' });
    expect(violListRes.status).toBe(200);
    expect(
      violListRes.body.data.incidents.some((inc: any) => inc.id === violId)
    ).toBe(true);

    // Community confirmation ("Still Present?" vote)
    const confirmRes = await request(app)
      .post(`/api/incidents/${violId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stillPresent: true, note: 'Confirmed still obstructing southbound traffic' });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.incident.stillPresentCount).toBeGreaterThanOrEqual(2);

    // Route optimization distinguishes unverified reports vs verified incidents & provides obstruction warning
    const routeWithUnverified = await request(app).get('/api/routes/alternatives').query({
      originNodeId: 'node-central',
      destinationNodeId: 'node-college',
    });
    expect(routeWithUnverified.status).toBe(200);
    const firstAlt = routeWithUnverified.body.data.alternatives[0];
    expect(Array.isArray(firstAlt.unverifiedReports)).toBe(true);
    expect(
      firstAlt.unverifiedReports.some((r: any) => r.id === violId)
    ).toBe(true);
    expect(firstAlt.obstructionWarning).toBeTruthy();

    // Admin expires stale report -> excluded from excludeExpired=true and cleared from active warnings
    const expireRes = await request(app)
      .patch(`/api/incidents/${violId}/expire`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(expireRes.status).toBe(200);
    expect(expireRes.body.data.incident.isExpired).toBe(true);

    const activeOnlyList = await request(app)
      .get('/api/incidents')
      .set('Authorization', `Bearer ${commuterToken}`)
      .query({ excludeExpired: 'true' });
    expect(activeOnlyList.status).toBe(200);
    expect(
      activeOnlyList.body.data.incidents.some((inc: any) => inc.id === violId)
    ).toBe(false);
  });

  it('supports Smart Parking filtering, atomic slot reservation, double-booking prevention, cancellation, and admin CRUD', async () => {
    const commuterToken = await loginAs('commuter@traffix.demo', 'DemoPass!123');
    const adminToken = await loginAs('admin@traffix.demo', 'AdminPass!123');

    // Filter parking by type, availability, price & sort by distance
    const listRes = await request(app).get('/api/parking').query({
      type: 'CAR',
      availability: 'OPEN_SPACES',
      maxPrice: 35,
      lat: 15.8524,
      lng: 74.5021,
      sort: 'distance',
    });
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.locations.length).toBeGreaterThan(0);
    expect(listRes.body.data.locations[0].isSample).toBe(true);

    // Inspect details & slots for park-central-1
    const detailRes = await request(app).get('/api/parking/park-central-1');
    expect(detailRes.status).toBe(200);
    const initialAvail = detailRes.body.data.parking.availableSlots;
    const freeSlot = detailRes.body.data.slots.find((s: any) => !s.occupied);
    expect(freeSlot).toBeTruthy();

    // Reserve available slot
    const reserveRes = await request(app)
      .post('/api/parking/park-central-1/reserve')
      .set('Authorization', `Bearer ${commuterToken}`)
      .send({
        slotNumber: freeSlot.slotNumber,
        vehicleType: 'CAR',
        vehicleNumber: 'KA-22-TX-7788',
        durationHours: 2,
      });
    expect(reserveRes.status).toBe(201);
    const reservationId = reserveRes.body.data.reservation.id;
    expect(reserveRes.body.data.parking.availableSlots).toBe(initialAvail - 1);

    // Concurrent / second user attempting same slot must fail with 409 Conflict
    const conflictRes = await request(app)
      .post('/api/parking/park-central-1/reserve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        slotNumber: freeSlot.slotNumber,
        vehicleType: 'CAR',
        vehicleNumber: 'KA-22-AD-0001',
        durationHours: 1,
      });
    expect(conflictRes.status).toBe(409);

    // Cancel reservation restores slot availability
    const cancelRes = await request(app)
      .patch(`/api/parking/reservations/${reservationId}/cancel`)
      .set('Authorization', `Bearer ${commuterToken}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.reservation.status).toBe('CANCELLED');
    expect(cancelRes.body.data.parking.availableSlots).toBe(initialAvail);

    // Admin creates new facility and marks FULL
    const createPark = await request(app)
      .post('/api/parking')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        parkingName: 'Subhash Nagar Annex Lot',
        address: 'Subhash Nagar Cross, Belagavi',
        latitude: 15.8602,
        longitude: 74.5082,
        parkingType: 'BOTH',
        totalSlots: 20,
        availableSlots: 12,
        pricePerHour: 15,
        openingTime: '06:00',
        closingTime: '22:00',
      });
    expect(createPark.status).toBe(201);
    const createdParkId = createPark.body.data.location.id;

    const closePark = await request(app)
      .patch(`/api/parking/${createdParkId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ availableSlots: 0, status: 'FULL' });
    expect(closePark.status).toBe(200);
    expect(closePark.body.data.location.status).toBe('FULL');
  });

  it('supports Bus Stop discovery, scheduled sample timetables, direct & interchange transit planning, and admin CRUD', async () => {
    const adminToken = await loginAs('admin@traffix.demo', 'AdminPass!123');

    // List bus stops & inspect stop details
    const stopsRes = await request(app).get('/api/transport/stops');
    expect(stopsRes.status).toBe(200);
    expect(stopsRes.body.data.stops.length).toBeGreaterThanOrEqual(12);

    const stopDetailRes = await request(app).get('/api/transport/stops/stop-central');
    expect(stopDetailRes.status).toBe(200);
    expect(stopDetailRes.body.data.stop.routes.length).toBeGreaterThan(0);
    expect(stopDetailRes.body.data.stop.nextSchedules.length).toBeGreaterThan(0);
    expect(stopDetailRes.body.data.routeDetails[0].isSample).toBe(true);

    // Direct bus route plan (CBT -> KLE)
    const directPlan = await request(app).get('/api/transport/plan').query({
      originStopId: 'stop-central',
      destStopId: 'stop-kle',
    });
    expect(directPlan.status).toBe(200);
    const directOptions = directPlan.body.data.options.filter((o: any) => o.type === 'DIRECT');
    expect(directOptions.length).toBeGreaterThan(0);
    expect(directOptions[0].legs.length).toBe(1);

    // Interchange (1-transfer) route plan (Udyambag -> Fort Lake requires transfer e.g. at CBT)
    const transferPlan = await request(app).get('/api/transport/plan').query({
      originStopId: 'stop-udyambag',
      destStopId: 'stop-fort',
    });
    expect(transferPlan.status).toBe(200);
    const transferOptions = transferPlan.body.data.options.filter(
      (o: any) => o.type === 'INTERCHANGE'
    );
    expect(transferOptions.length).toBeGreaterThan(0);
    expect(transferOptions[0].legs.length).toBe(2);
    expect(transferOptions[0].interchangeStop.stopName).toBeTruthy();

    // Admin creates new bus stop and bus route
    const newStop = await request(app)
      .post('/api/transport/stops')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        stopName: 'Sadashiv Nagar Civic Stop',
        address: 'Sadashiv Nagar Main, Belagavi',
        landmark: 'Civic Park Gate',
        direction: 'Northbound',
        latitude: 15.8655,
        longitude: 74.5065,
      });
    expect(newStop.status).toBe(201);

    const newRoute = await request(app)
      .post('/api/transport/routes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        routeNumber: '610',
        routeName: 'Sadashiv Nagar – CBT Shuttle',
        startingPoint: 'Sadashiv Nagar Civic Stop',
        destination: 'Central Bus Terminus (CBT)',
        routeDescription: 'Sample feeder loop serving Sadashiv Nagar and Chennamma Circle.',
        estimatedDurationMin: 18,
        frequencyMin: 20,
        serviceStartTime: '06:30',
        serviceEndTime: '21:30',
      });
    expect(newRoute.status).toBe(201);
    expect(newRoute.body.data.route.routeNumber).toBe('610');
  });

  it('supports Emergency SOS contacts CRUD, honest assistance logging, and Google Places Nearby Hospitals without synthetic fabrication', async () => {
    const commuterToken = await loginAs('commuter@traffix.demo', 'DemoPass!123');
    const adminToken = await loginAs('admin@traffix.demo', 'AdminPass!123');

    // 1. Seeded demo commuter emergency contacts present
    const listRes = await request(app)
      .get('/api/sos/contacts')
      .set('Authorization', `Bearer ${commuterToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.contacts.length).toBeGreaterThanOrEqual(2);

    // 2. Create, update, and isolate emergency contact
    const createRes = await request(app)
      .post('/api/sos/contacts')
      .set('Authorization', `Bearer ${commuterToken}`)
      .send({
        name: 'Vikram Joshi',
        relationship: 'Brother',
        phone: '+91 99001 55667',
        notes: 'O+ Blood Group',
        isPrimary: true,
      });
    expect(createRes.status).toBe(201);
    const createdId = createRes.body.data.contact.id;
    expect(createRes.body.data.contact.isPrimary).toBe(true);

    // Another user (admin) cannot update or delete commuter's personal emergency contact
    const forbiddenUpdate = await request(app)
      .patch(`/api/sos/contacts/${createdId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Tampered' });
    expect(forbiddenUpdate.status).toBe(403);

    const updateRes = await request(app)
      .patch(`/api/sos/contacts/${createdId}`)
      .set('Authorization', `Bearer ${commuterToken}`)
      .send({ phone: '+91 99001 77889' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.contact.phone).toBe('+91 99001 77889');

    // 3. Emergency Assistance History logging
    const sosLogRes = await request(app)
      .post('/api/sos/history')
      .set('Authorization', `Bearer ${commuterToken}`)
      .send({
        eventType: 'DIAL_CLICKED',
        serviceDialed: '108',
        latitude: 15.853,
        longitude: 74.502,
        locationLabel: 'Rani Chennamma Circle',
        notes: 'Device dialer opened by user',
      });
    expect(sosLogRes.status).toBe(201);

    const histRes = await request(app)
      .get('/api/sos/history')
      .set('Authorization', `Bearer ${commuterToken}`);
    expect(histRes.status).toBe(200);
    expect(histRes.body.data.logs.some((l: any) => l.serviceDialed === '108')).toBe(true);

    const delRes = await request(app)
      .delete(`/api/sos/contacts/${createdId}`)
      .set('Authorization', `Bearer ${commuterToken}`);
    expect(delRes.status).toBe(200);

    // 4. Nearby hospitals when offline/test-isolated returns UNAVAILABLE and zero fabricated hospitals
    const offlineHosp = await request(app)
      .get('/api/sos/hospitals')
      .query({ lat: 15.853, lng: 74.502, radius: 5000 });
    expect(offlineHosp.status).toBe(200);
    expect(offlineHosp.body.data.source).toBe('UNAVAILABLE');
    expect(offlineHosp.body.data.hospitals).toEqual([]);

    // 5. Mocked Google Places API (New) searchNearby succeeds & sorts by distance, and handles 429 quota cleanly
    const origFetch = globalThis.fetch;
    process.env.TRAFFIX_TEST_FETCH = 'true';
    globalThis.fetch = (async (_url: string) =>
      new Response(
        JSON.stringify({
          places: [
            {
              id: 'ChIJ_hosp_far',
              displayName: { text: 'District Civil Hospital' },
              formattedAddress: 'Civil Road, Belagavi',
              location: { latitude: 15.868, longitude: 74.512 },
              nationalPhoneNumber: '0831 242 0100',
              currentOpeningHours: { openNow: true },
              rating: 4.1,
              userRatingCount: 320,
              googleMapsUri: 'https://maps.google.com/?cid=101',
            },
            {
              id: 'ChIJ_hosp_near',
              displayName: { text: 'KLE Dr. Prabhakar Kore Hospital' },
              formattedAddress: 'Nehru Nagar, Belagavi',
              location: { latitude: 15.855, longitude: 74.503 },
              nationalPhoneNumber: '0831 247 3777',
              currentOpeningHours: { openNow: true },
              rating: 4.5,
              userRatingCount: 1450,
              googleMapsUri: 'https://maps.google.com/?cid=102',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )) as any;

    try {
      const hospOk = await request(app)
        .get('/api/sos/hospitals')
        .query({ lat: 15.853, lng: 74.502, radius: 8000 });
      expect(hospOk.status).toBe(200);
      expect(hospOk.body.data.source).toBe('GOOGLE_PLACES_NEW');
      expect(hospOk.body.data.hospitals.length).toBe(2);
      expect(hospOk.body.data.hospitals[0].placeId).toBe('ChIJ_hosp_near');
      expect(hospOk.body.data.hospitals[0].distanceMeters).toBeLessThan(
        hospOk.body.data.hospitals[1].distanceMeters
      );

      // Simulate 429 quota exceeded response
      globalThis.fetch = (async () =>
        new Response(
          JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } }),
          { status: 429, headers: { 'Content-Type': 'application/json' } }
        )) as any;

      const hospQuota = await request(app)
        .get('/api/sos/hospitals')
        .query({ lat: 15.853, lng: 74.502 });
      expect(hospQuota.status).toBe(200);
      expect(hospQuota.body.data.source).toBe('UNAVAILABLE');
      expect(hospQuota.body.data.quotaExceeded).toBe(true);
      expect(hospQuota.body.data.hospitals).toEqual([]);
    } finally {
      globalThis.fetch = origFetch;
      delete process.env.TRAFFIX_TEST_FETCH;
    }
  });

  it('supports 5 Google Routes travel modes, traffic intervals, tolls, transit details, and refuses inventing car routes for unsupported modes', async () => {
    const origFetch = globalThis.fetch;
    process.env.TRAFFIX_TEST_FETCH = 'true';

    // Encoded polyline from (15.853, 74.502) to (15.868, 74.518) (~5 points)
    const samplePolyline = '_{~_BgtleM_@_@_@_@_@_@';

    try {
      // 1. DRIVE mode with speedReadingIntervals + tollInfo + alternative route
      globalThis.fetch = (async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || '{}'));
        expect(body.travelMode).toBe('DRIVE');
        expect(body.routingPreference).toBe('TRAFFIC_AWARE');
        expect(body.extraComputations).toEqual(['TRAFFIC_ON_POLYLINE', 'TOLLS']);
        return new Response(
          JSON.stringify({
            routes: [
              {
                distanceMeters: 4200,
                duration: '720s',
                staticDuration: '480s',
                description: 'NH48 Bypass Corridor',
                polyline: { encodedPolyline: samplePolyline },
                travelAdvisory: {
                  speedReadingIntervals: [
                    { startPolylinePointIndex: 0, endPolylinePointIndex: 2, speed: 'NORMAL' },
                    { startPolylinePointIndex: 2, endPolylinePointIndex: 4, speed: 'TRAFFIC_JAM' },
                  ],
                  tollInfo: {
                    estimatedPrice: [{ currencyCode: 'INR', units: '45', nanos: 0 }],
                  },
                },
                legs: [
                  {
                    steps: [
                      {
                        distanceMeters: 1200,
                        staticDuration: '120s',
                        navigationInstruction: {
                          instructions: 'Turn right onto Club Road',
                          maneuver: 'TURN_RIGHT',
                        },
                        startLocation: { latLng: { latitude: 15.853, longitude: 74.502 } },
                      },
                    ],
                  },
                ],
              },
              {
                distanceMeters: 4500,
                duration: '540s',
                staticDuration: '500s',
                description: 'Khanapur Inner Road',
                polyline: { encodedPolyline: samplePolyline },
                travelAdvisory: {
                  speedReadingIntervals: [
                    { startPolylinePointIndex: 0, endPolylinePointIndex: 4, speed: 'NORMAL' },
                  ],
                },
                legs: [{ steps: [] }],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as any;

      const driveRes = await request(app).get('/api/routes/alternatives').query({
        originLat: 15.853,
        originLng: 74.502,
        destinationLat: 15.868,
        destinationLng: 74.518,
        travelMode: 'DRIVE',
      });
      expect(driveRes.status).toBe(200);
      expect(driveRes.body.data.travelMode).toBe('DRIVE');
      expect(driveRes.body.data.liveTrafficAvailable).toBe(true);
      expect(driveRes.body.data.alternatives.length).toBeGreaterThanOrEqual(2);
      const firstDriveRoute = driveRes.body.data.alternatives.find(
        (r: any) => r.tollInfo?.estimatedPriceText === '₹45'
      );
      expect(firstDriveRoute).toBeTruthy();
      expect(firstDriveRoute.speedReadingIntervals.length).toBe(2);

      // 2. TRANSIT mode returns transitSteps and omits routingPreference
      globalThis.fetch = (async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || '{}'));
        expect(body.travelMode).toBe('TRANSIT');
        expect(body.routingPreference).toBeUndefined();
        return new Response(
          JSON.stringify({
            routes: [
              {
                distanceMeters: 3100,
                duration: '900s',
                staticDuration: '900s',
                polyline: { encodedPolyline: samplePolyline },
                legs: [
                  {
                    steps: [
                      {
                        distanceMeters: 3100,
                        staticDuration: '900s',
                        startLocation: { latLng: { latitude: 15.854, longitude: 74.503 } },
                        transitDetails: {
                          transitLine: {
                            name: 'NWKRTC Circular 101',
                            nameShort: '101',
                            vehicle: { type: 'BUS', name: { text: 'Bus' } },
                          },
                          headsign: 'CBT Terminus',
                          stopCount: 5,
                          stopDetails: {
                            departureStop: { name: 'Chennamma Circle' },
                            arrivalStop: { name: 'Central Bus Terminus' },
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as any;

      const transitRes = await request(app).get('/api/routes/alternatives').query({
        originLat: 15.854,
        originLng: 74.503,
        destinationLat: 15.869,
        destinationLng: 74.519,
        travelMode: 'TRANSIT',
      });
      expect(transitRes.status).toBe(200);
      expect(transitRes.body.data.travelMode).toBe('TRANSIT');
      expect(transitRes.body.data.alternatives[0].transitSteps.length).toBe(1);
      expect(transitRes.body.data.alternatives[0].transitSteps[0].shortName).toBe('101');

      // 3. WALK mode includes Beta notice
      globalThis.fetch = (async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || '{}'));
        expect(body.travelMode).toBe('WALK');
        return new Response(
          JSON.stringify({
            routes: [
              {
                distanceMeters: 1200,
                duration: '840s',
                staticDuration: '840s',
                polyline: { encodedPolyline: samplePolyline },
                legs: [{ steps: [] }],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as any;

      const walkRes = await request(app).get('/api/routes/alternatives').query({
        originLat: 15.855,
        originLng: 74.504,
        destinationLat: 15.861,
        destinationLng: 74.509,
        travelMode: 'WALK',
      });
      expect(walkRes.status).toBe(200);
      expect(walkRes.body.data.alternatives[0].betaWarning).toMatch(/Beta/i);

      // 4. Unsupported TRANSIT or BICYCLE route returns 422 instead of inventing a car route
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ routes: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })) as any;

      const unsupportedTransit = await request(app).get('/api/routes/alternatives').query({
        originLat: 15.901,
        originLng: 74.601,
        destinationLat: 15.951,
        destinationLng: 74.651,
        travelMode: 'TRANSIT',
      });
      expect(unsupportedTransit.status).toBe(422);
      expect(unsupportedTransit.body.success).toBe(false);
    } finally {
      globalThis.fetch = origFetch;
      delete process.env.TRAFFIX_TEST_FETCH;
    }
  });

  it('serves Google Places nearby search for navigation chips and merges TRAFFIX sample parking/bus facilities cleanly', async () => {
    // 1. Offline: gas_station returns UNAVAILABLE with empty list, parking returns TRAFFIX_SAMPLE only
    const offlineGas = await request(app)
      .get('/api/routes/nearby-places')
      .query({ lat: 15.853, lng: 74.502, category: 'gas_station' });
    expect(offlineGas.status).toBe(200);
    expect(offlineGas.body.data.source).toBe('UNAVAILABLE');
    expect(offlineGas.body.data.places).toEqual([]);

    const offlineParking = await request(app)
      .get('/api/routes/nearby-places')
      .query({ lat: 15.853, lng: 74.502, category: 'parking', radius: 10000 });
    expect(offlineParking.status).toBe(200);
    expect(offlineParking.body.data.places.length).toBeGreaterThan(0);
    expect(offlineParking.body.data.places.every((p: any) => p.source === 'TRAFFIX_SAMPLE')).toBe(
      true
    );

    // 2. Online Google Places New mock for gas_station
    const origFetch = globalThis.fetch;
    process.env.TRAFFIX_TEST_FETCH = 'true';
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          places: [
            {
              id: 'ChIJ_fuel_1',
              displayName: { text: 'IndianOil Fuel Station' },
              formattedAddress: 'Club Road, Belagavi',
              location: { latitude: 15.8545, longitude: 74.5035 },
              currentOpeningHours: { openNow: true },
              rating: 4.3,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )) as any;

    try {
      const onlineGas = await request(app)
        .get('/api/routes/nearby-places')
        .query({ lat: 15.853, lng: 74.502, category: 'gas_station' });
      expect(onlineGas.status).toBe(200);
      expect(onlineGas.body.data.source).toBe('GOOGLE_PLACES_NEW');
      expect(onlineGas.body.data.places[0].name).toBe('IndianOil Fuel Station');
    } finally {
      globalThis.fetch = origFetch;
      delete process.env.TRAFFIX_TEST_FETCH;
    }
  });

  it('parses voice search queries and builds localized turn-by-turn phrases in 5 languages', () => {
    expect(parseVoiceSearchQuery('Take me to Mysore Palace')).toEqual({
      rawTranscript: 'Take me to Mysore Palace',
      cleanQuery: 'Mysore Palace',
      nearbyCategory: null,
    });
    expect(parseVoiceSearchQuery('Find the nearest petrol pump')).toEqual({
      rawTranscript: 'Find the nearest petrol pump',
      cleanQuery: 'petrol pump',
      nearbyCategory: 'gas_station',
    });
    expect(parseVoiceSearchQuery('nearest hospital')).toEqual({
      rawTranscript: 'nearest hospital',
      cleanQuery: 'nearest hospital',
      nearbyCategory: 'hospital',
    });

    const languages = ['en', 'hi', 'kn', 'te', 'ta'] as const;
    for (const lang of languages) {
      const text = formatNavigationInstruction(
        'Turn right onto MG Road',
        300,
        lang,
        'TURN_RIGHT'
      );
      expect(text.length).toBeGreaterThan(5);
      expect(getNavigationPhrase('reroute', lang).length).toBeGreaterThan(3);
      expect(getNavigationPhrase('arrived', lang).length).toBeGreaterThan(3);
    }

    const d = haversineDistanceMeters(15.853, 74.502, 15.853, 74.502);
    expect(d).toBe(0);
    const offRouteDist = minDistanceToRouteMeters(15.86, 74.51, [
      [15.85, 74.5],
      [15.85, 74.52],
    ]);
    expect(offRouteDist).toBeGreaterThan(1000);
  });
});
