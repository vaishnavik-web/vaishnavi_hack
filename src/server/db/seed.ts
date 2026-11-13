import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

export function seedDatabase(db: Database.Database): void {
  const now = new Date().toISOString();

  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
  `);

  const demoUsers = [
    {
      id: 'usr-commuter-1',
      name: 'Aarav Kulkarni (Demo Commuter)',
      email: 'commuter@traffix.demo',
      pass: 'DemoPass!123',
      role: 'COMMUTER',
    },
    {
      id: 'usr-admin-1',
      name: 'Meera Deshmukh (Demo Traffic Admin)',
      email: 'admin@traffix.demo',
      pass: 'AdminPass!123',
      role: 'ADMIN',
    },
    {
      id: 'usr-signal-1',
      name: 'Rohan Patil (Demo Signal Operator)',
      email: 'signal@traffix.demo',
      pass: 'SignalPass!123',
      role: 'SIGNAL_OPERATOR',
    },
    {
      id: 'usr-emerg-1',
      name: 'Dr. Kavita Rao (Demo Emergency Operator)',
      email: 'emergency@traffix.demo',
      pass: 'EmergPass!123',
      role: 'EMERGENCY_OPERATOR',
    },
  ];

  const nodes = [
    { id: 'node-central', ref: 'N01', name: 'Central Bus Terminus', lat: 15.8520, lng: 74.5010, junction: 1, zone: 'Central Core' },
    { id: 'node-chennamma', ref: 'N02', name: 'Rani Chennamma Circle', lat: 15.8585, lng: 74.5045, junction: 1, zone: 'Central Core' },
    { id: 'node-congress', ref: 'N03', name: 'Congress Road Junction', lat: 15.8470, lng: 74.4960, junction: 1, zone: 'South Corridor' },
    { id: 'node-tilakwadi', ref: 'N04', name: 'Tilakwadi First Gate', lat: 15.8405, lng: 74.4920, junction: 0, zone: 'Tilakwadi' },
    { id: 'node-camp', ref: 'N05', name: 'Camp Artillery Chowk', lat: 15.8535, lng: 74.4875, junction: 1, zone: 'Cantonment' },
    { id: 'node-fort', ref: 'N06', name: 'Fort Lake Circle', lat: 15.8640, lng: 74.5130, junction: 1, zone: 'East Arterial' },
    { id: 'node-kle', ref: 'N07', name: 'KLE Medical Corridor', lat: 15.8695, lng: 74.5025, junction: 1, zone: 'North Medical' },
    { id: 'node-nehru', ref: 'N08', name: 'Nehru Nagar Bypass', lat: 15.8730, lng: 74.5145, junction: 0, zone: 'North Bypass' },
    { id: 'node-shahpur', ref: 'N09', name: 'Shahpur Market Cross', lat: 15.8445, lng: 74.5110, junction: 1, zone: 'Shahpur' },
    { id: 'node-vadgaon', ref: 'N10', name: 'Vadgaon Arterial South', lat: 15.8375, lng: 74.5150, junction: 0, zone: 'Vadgaon' },
    { id: 'node-udyambag', ref: 'N11', name: 'Udyambag Industrial Gate', lat: 15.8330, lng: 74.4995, junction: 0, zone: 'Industrial Zone' },
    { id: 'node-college', ref: 'N12', name: 'College Road Plaza', lat: 15.8555, lng: 74.4975, junction: 0, zone: 'Central Core' },
    { id: 'node-bogarves', ref: 'N13', name: 'Bogarves Commercial Hub', lat: 15.8505, lng: 74.5095, junction: 0, zone: 'Central Core' },
    { id: 'node-hindalga', ref: 'N14', name: 'Hindalga West Ring', lat: 15.8575, lng: 74.4785, junction: 0, zone: 'West Ring' },
    { id: 'node-kanabargi', ref: 'N15', name: 'Kanabargi Ring East', lat: 15.8665, lng: 74.5250, junction: 0, zone: 'East Ring' },
    { id: 'node-station', ref: 'N16', name: 'Railway Station Forecourt', lat: 15.8460, lng: 74.5040, junction: 1, zone: 'Central Core' },
  ];

  // Road segments carefully calibrated so shortest-distance (congested core) != fastest-time (outer bypass)
  const segments = [
    { id: 'seg-01', name: 'Khade Bazaar Central Spine', s: 'node-central', e: 'node-chennamma', len: 820, cap: 1200, spd: 32, cong: 0.72 },
    { id: 'seg-02', name: 'College Road Avenue', s: 'node-college', e: 'node-chennamma', len: 840, cap: 1100, spd: 30, cong: 0.76 },
    { id: 'seg-03', name: 'Central-College Link', s: 'node-central', e: 'node-college', len: 560, cap: 1000, spd: 30, cong: 0.68 },
    { id: 'seg-04', name: 'Congress Inner Corridor', s: 'node-congress', e: 'node-central', len: 790, cap: 1300, spd: 35, cong: 0.65 },
    { id: 'seg-05', name: 'Tilakwadi Main Road', s: 'node-tilakwadi', e: 'node-congress', len: 860, cap: 1400, spd: 38, cong: 0.58 },
    { id: 'seg-06', name: 'Congress-College Connector', s: 'node-congress', e: 'node-college', len: 970, cap: 1150, spd: 34, cong: 0.64 },
    { id: 'seg-07', name: 'Camp Artillery Road', s: 'node-congress', e: 'node-camp', len: 1180, cap: 1800, spd: 55, cong: 0.24 },
    { id: 'seg-08', name: 'Tilakwadi-Camp Ring', s: 'node-tilakwadi', e: 'node-camp', len: 1540, cap: 2200, spd: 65, cong: 0.18 },
    { id: 'seg-09', name: 'Camp-College Connector', s: 'node-camp', e: 'node-college', len: 1100, cap: 1700, spd: 50, cong: 0.30 },
    { id: 'seg-10', name: 'Hindalga West Expressway', s: 'node-camp', e: 'node-hindalga', len: 1080, cap: 2600, spd: 70, cong: 0.14 },
    { id: 'seg-11', name: 'North West Ring Arterial', s: 'node-hindalga', e: 'node-kle', len: 2950, cap: 2800, spd: 72, cong: 0.16 },
    { id: 'seg-12', name: 'KLE Hospital Highway', s: 'node-chennamma', e: 'node-kle', len: 1260, cap: 1900, spd: 48, cong: 0.44 },
    { id: 'seg-13', name: 'Nehru Nagar Bypass North', s: 'node-kle', e: 'node-nehru', len: 1380, cap: 2600, spd: 68, cong: 0.19 },
    { id: 'seg-14', name: 'Fort-Nehru Ring Road', s: 'node-fort', e: 'node-nehru', len: 1050, cap: 2500, spd: 66, cong: 0.22 },
    { id: 'seg-15', name: 'Fort Lake Boulevard', s: 'node-chennamma', e: 'node-fort', len: 1120, cap: 2000, spd: 52, cong: 0.36 },
    { id: 'seg-16', name: 'Bogarves-Fort Link', s: 'node-bogarves', e: 'node-fort', len: 1560, cap: 1900, spd: 52, cong: 0.32 },
    { id: 'seg-17', name: 'Bogarves Market Street', s: 'node-central', e: 'node-bogarves', len: 940, cap: 1250, spd: 34, cong: 0.62 },
    { id: 'seg-18', name: 'Station-Central Feeder', s: 'node-station', e: 'node-central', len: 740, cap: 1350, spd: 36, cong: 0.54 },
    { id: 'seg-19', name: 'Station-Bogarves Avenue', s: 'node-station', e: 'node-bogarves', len: 780, cap: 1600, spd: 46, cong: 0.38 },
    { id: 'seg-20', name: 'Station-Congress Link', s: 'node-congress', e: 'node-station', len: 880, cap: 1500, spd: 42, cong: 0.42 },
    { id: 'seg-21', name: 'Shahpur Station Road', s: 'node-station', e: 'node-shahpur', len: 790, cap: 1450, spd: 40, cong: 0.47 },
    { id: 'seg-22', name: 'Shahpur-Bogarves Bypass', s: 'node-shahpur', e: 'node-bogarves', len: 700, cap: 1650, spd: 46, cong: 0.35 },
    { id: 'seg-23', name: 'Vadgaon-Shahpur Corridor', s: 'node-vadgaon', e: 'node-shahpur', len: 910, cap: 1750, spd: 50, cong: 0.28 },
    { id: 'seg-24', name: 'Udyambag-Tilakwadi Belt', s: 'node-udyambag', e: 'node-tilakwadi', len: 1180, cap: 2100, spd: 58, cong: 0.25 },
    { id: 'seg-25', name: 'Udyambag-Vadgaon South Ring', s: 'node-udyambag', e: 'node-vadgaon', len: 1780, cap: 2400, spd: 64, cong: 0.20 },
    { id: 'seg-26', name: 'Kanabargi East Bypass', s: 'node-fort', e: 'node-kanabargi', len: 1340, cap: 2500, spd: 68, cong: 0.17 },
    { id: 'seg-27', name: 'Kanabargi-Shahpur Ring', s: 'node-shahpur', e: 'node-kanabargi', len: 2880, cap: 2600, spd: 68, cong: 0.19 },
    { id: 'seg-28', name: 'Kanabargi-Nehru Outer Loop', s: 'node-kanabargi', e: 'node-nehru', len: 1360, cap: 2700, spd: 70, cong: 0.15 },
  ];

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const tx = db.transaction(() => {
    for (const u of demoUsers) {
      const hash = bcrypt.hashSync(u.pass, 10);
      insertUser.run(u.id, u.name, u.email, hash, u.role, now, now);
    }

    const insertNode = db.prepare(`
      INSERT INTO road_nodes (id, external_ref, name, latitude, longitude, is_junction, zone, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const n of nodes) {
      insertNode.run(n.id, n.ref, n.name, n.lat, n.lng, n.junction, n.zone, JSON.stringify({ seeded: true }));
    }

    const insertSeg = db.prepare(`
      INSERT INTO road_segments (id, name, start_node_id, end_node_id, geometry_json, length_meters, capacity_vph, speed_limit_kmh, current_congestion, closure_status, weather_factor, one_way, is_simulated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', 1.0, 0, 1)
    `);
    for (const s of segments) {
      const sn = nodeMap.get(s.s)!;
      const en = nodeMap.get(s.e)!;
      const midLat = Number(((sn.lat + en.lat) / 2 + (s.len % 7 - 3) * 0.00025).toFixed(5));
      const midLng = Number(((sn.lng + en.lng) / 2 + (s.len % 5 - 2) * 0.00025).toFixed(5));
      const geometry: Array<[number, number]> = [
        [sn.lat, sn.lng],
        [midLat, midLng],
        [en.lat, en.lng],
      ];
      insertSeg.run(s.id, s.name, s.s, s.e, JSON.stringify(geometry), s.len, s.cap, s.spd, s.cong);
    }

    // Seed historical/simulated traffic observations (last 24 hours across segments for regression model training)
    const insertObs = db.prepare(`
      INSERT INTO traffic_observations (id, segment_id, observed_at, vehicle_count, average_speed_kmh, queue_length, weather_condition, source, is_simulated)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'SIMULATED_HISTORICAL_PROFILE', 1)
    `);

    const baseTime = Date.now();
    let obsIdx = 1;
    for (const s of segments) {
      for (let h = 24; h >= 0; h -= 2) {
        const obsDate = new Date(baseTime - h * 3600 * 1000);
        const hour = obsDate.getHours();
        const peakBoost =
          (hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20) ? 0.22 : hour >= 23 || hour <= 5 ? -0.15 : 0.0;
        const density = Math.min(0.95, Math.max(0.08, s.cong + peakBoost + ((obsIdx % 5) - 2) * 0.02));
        const vehCount = Math.round(s.cap * density * 0.35);
        const avgSpeed = Number(Math.max(8, s.spd * (1 - density * 0.68)).toFixed(1));
        const queueLen = Math.round(density * 28);
        insertObs.run(`obs-${obsIdx++}`, s.id, obsDate.toISOString(), vehCount, avgSpeed, queueLen, 'CLEAR');
      }
    }

    // Seed 6 configurable signalized junctions
    const junctionDefs = [
      {
        id: 'junc-chennamma',
        nodeId: 'node-chennamma',
        name: 'Rani Chennamma Circle',
        approaches: ['North (KLE)', 'South (Central)', 'East (Fort)', 'West (College)'],
        lanes: 4,
        phases: [
          { phaseId: 'P1', approach: 'North-South Arterial', greenSec: 34, amberSec: 4, redSec: 42 },
          { phaseId: 'P2', approach: 'East-West Corridor', greenSec: 38, amberSec: 4, redSec: 38 },
        ],
      },
      {
        id: 'junc-central',
        nodeId: 'node-central',
        name: 'Central Bus Terminus Junction',
        approaches: ['North (Chennamma)', 'South (Congress)', 'East (Bogarves)'],
        lanes: 3,
        phases: [
          { phaseId: 'P1', approach: 'Terminus Main Flow', greenSec: 36, amberSec: 4, redSec: 40 },
          { phaseId: 'P2', approach: 'Bogarves Feeder', greenSec: 36, amberSec: 4, redSec: 40 },
        ],
      },
      {
        id: 'junc-congress',
        nodeId: 'node-congress',
        name: 'Congress Road Signal',
        approaches: ['North (College)', 'South (Tilakwadi)', 'West (Camp)', 'East (Station)'],
        lanes: 4,
        phases: [
          { phaseId: 'P1', approach: 'Congress North-South', greenSec: 40, amberSec: 4, redSec: 36 },
          { phaseId: 'P2', approach: 'Camp-Station Cross', greenSec: 32, amberSec: 4, redSec: 44 },
        ],
      },
      {
        id: 'junc-fort',
        nodeId: 'node-fort',
        name: 'Fort Lake Circle',
        approaches: ['West (Chennamma)', 'North (Nehru)', 'East (Kanabargi)', 'South (Bogarves)'],
        lanes: 4,
        phases: [
          { phaseId: 'P1', approach: 'East-West Ring', greenSec: 42, amberSec: 4, redSec: 34 },
          { phaseId: 'P2', approach: 'North-South Arterial', greenSec: 30, amberSec: 4, redSec: 46 },
        ],
      },
      {
        id: 'junc-kle',
        nodeId: 'node-kle',
        name: 'KLE Medical Corridor Gate',
        approaches: ['South (Chennamma)', 'North (Nehru)', 'West (Hindalga)'],
        lanes: 4,
        phases: [
          { phaseId: 'P1', approach: 'Hospital Main Gate', greenSec: 35, amberSec: 4, redSec: 41 },
          { phaseId: 'P2', approach: 'Bypass Ring Flow', greenSec: 37, amberSec: 4, redSec: 39 },
        ],
      },
      {
        id: 'junc-station',
        nodeId: 'node-station',
        name: 'Railway Station Forecourt',
        approaches: ['North (Central)', 'East (Bogarves)', 'South (Shahpur)', 'West (Congress)'],
        lanes: 3,
        phases: [
          { phaseId: 'P1', approach: 'Station Forecourt Axis', greenSec: 33, amberSec: 4, redSec: 43 },
          { phaseId: 'P2', approach: 'Shahpur-Congress Link', greenSec: 39, amberSec: 4, redSec: 37 },
        ],
      },
    ];

    const insertJunction = db.prepare(`
      INSERT INTO junctions (id, node_id, name, latitude, longitude, approaches_json, lanes_count, min_green_sec, max_green_sec, cycle_length_sec, current_phases_json, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 15, 75, 80, ?, 1)
    `);
    for (const j of junctionDefs) {
      const n = nodeMap.get(j.nodeId)!;
      insertJunction.run(
        j.id,
        j.nodeId,
        j.name,
        n.lat,
        n.lng,
        JSON.stringify(j.approaches),
        j.lanes,
        JSON.stringify(j.phases)
      );
    }

    // Seed sample incidents (1 verified congestion, 1 pending collision, 1 resolved breakdown)
    const insertIncident = db.prepare(`
      INSERT INTO incidents (
        id, reporter_id, type, description, latitude, longitude, road_segment_id,
        severity, estimated_severity, severity_confidence, severity_reasons_json,
        status, image_url, possible_duplicate, canonical_incident_id, duplicate_score, duplicate_reason,
        verified_by, created_at, updated_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, NULL, NULL, ?, ?, ?, ?)
    `);

    const minsAgo = (m: number) => new Date(baseTime - m * 60000).toISOString();

    insertIncident.run(
      'inc-seed-1',
      'usr-commuter-1',
      'CONGESTION',
      'Heavy afternoon queue build-up near College Road bus stop restricting left lane.',
      15.8565,
      74.5005,
      'seg-02',
      'HIGH',
      'HIGH',
      0.84,
      JSON.stringify(['High baseline corridor load (76%)', 'Peak commercial lane bottleneck']),
      'VERIFIED',
      'usr-admin-1',
      minsAgo(45),
      minsAgo(40),
      null
    );

    insertIncident.run(
      'inc-seed-2',
      'usr-commuter-1',
      'ACCIDENT',
      'Minor two-wheeler collision near Central Bus Terminus north exit, waiting for clearance.',
      15.8548,
      74.5025,
      'seg-01',
      'MEDIUM',
      'HIGH',
      0.79,
      JSON.stringify(['Incident type ACCIDENT', 'High-density central spine segment']),
      'PENDING',
      null,
      minsAgo(18),
      minsAgo(18),
      null
    );

    insertIncident.run(
      'inc-seed-3',
      'usr-commuter-1',
      'BREAKDOWN',
      'Stalled delivery van cleared from Shahpur Station Road shoulder.',
      15.8452,
      74.5075,
      'seg-21',
      'LOW',
      'LOW',
      0.88,
      JSON.stringify(['Single-vehicle shoulder breakdown']),
      'RESOLVED',
      'usr-admin-1',
      minsAgo(160),
      minsAgo(95),
      minsAgo(95)
    );

    // Seed emergency vehicles
    const insertVehicle = db.prepare(`
      INSERT INTO emergency_vehicles (id, operator_id, vehicle_type, registration_label, available, created_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `);
    insertVehicle.run('veh-amb-01', 'usr-emerg-1', 'AMBULANCE', 'KA-22-EM-108 (ALS Unit 1)', now);
    insertVehicle.run('veh-fire-02', 'usr-emerg-1', 'FIRE_TRUCK', 'KA-22-FR-101 (Rapid Tender 2)', now);

    // Seed audit log entry for seeded data provenance
    db.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_email, action, target_type, target_id, before_summary, after_summary, created_at)
      VALUES (?, 'system-seed', 'system@traffix.demo', 'SEED_DEMO_DATA', 'NETWORK', 'belagavi-sim-grid', 'Empty database', 'Seeded 16 nodes, 28 segments, 6 junctions, 4 demo accounts (DEV ONLY)', ?)
    `).run('aud-seed-1', now);
  });

  tx();
  seedNewModules(db);
}

export function seedNewModules(db: Database.Database): void {
  const now = new Date().toISOString();
  const futureHours = (h: number) => new Date(Date.now() + h * 3600 * 1000).toISOString();
  const minsAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();

  const tx = db.transaction(() => {
    // 1. Seed violation reports (Wrong-way driving & Illegal parking) if absent
    const hasViolation = db
      .prepare(`SELECT COUNT(*) as cnt FROM incidents WHERE type IN ('WRONG_WAY_DRIVING', 'ILLEGAL_PARKING')`)
      .get() as { cnt: number };

    if (hasViolation.cnt === 0) {
      const insertViolation = db.prepare(`
        INSERT OR IGNORE INTO incidents (
          id, reporter_id, type, description, latitude, longitude, road_name, landmark, road_segment_id,
          severity, estimated_severity, severity_confidence, severity_reasons_json,
          status, image_url, possible_duplicate, canonical_incident_id, duplicate_score, duplicate_reason,
          verified_by, occurred_at, expires_at, still_present_count, last_confirmed_at, created_at, updated_at, resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, NULL)
      `);

      insertViolation.run(
        'inc-viol-1',
        'usr-commuter-1',
        'WRONG_WAY_DRIVING',
        'Two-wheelers and auto-rickshaws entering opposite lane near Central Bus Terminus rotary.',
        15.8528,
        74.5015,
        'Khade Bazaar Central Spine',
        'Opposite Central Bus Terminus Gate 2',
        'seg-01',
        'HIGH',
        'CRITICAL',
        0.87,
        JSON.stringify(['Wrong-way lane encroachment on high-load spine', 'Verified violation report']),
        'VERIFIED',
        'usr-admin-1',
        minsAgo(32),
        futureHours(6),
        3,
        minsAgo(12),
        minsAgo(32),
        minsAgo(12)
      );

      insertViolation.run(
        'inc-viol-2',
        'usr-commuter-1',
        'ILLEGAL_PARKING',
        'Double-parked commercial vans occupying left carriageway outside College Road bookstores.',
        15.8559,
        74.4986,
        'College Road Avenue',
        'Near Lingaraj College Gate',
        'seg-02',
        'MEDIUM',
        'HIGH',
        0.81,
        JSON.stringify(['Illegal parking obstructing busy commercial corridor']),
        'PENDING',
        null,
        minsAgo(20),
        futureHours(5),
        1,
        minsAgo(20),
        minsAgo(20),
        minsAgo(20)
      );
    }

    // 2. Seed sample Smart Parking Locations
    const parkingCount = (db.prepare('SELECT COUNT(*) as cnt FROM parking_locations').get() as { cnt: number }).cnt;
    if (parkingCount === 0) {
      const insertParking = db.prepare(`
        INSERT INTO parking_locations (
          id, parking_name, address, latitude, longitude, parking_type,
          total_slots, available_slots, price_per_hour, price_label,
          opening_time, closing_time, contact_info, status, is_sample, updated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `);

      const parkingSeed = [
        {
          id: 'park-central-1',
          name: 'CBT Multi-Level Smart Plaza',
          address: 'Central Bus Terminus East Wing, Belagavi',
          lat: 15.8524,
          lng: 74.5021,
          type: 'BOTH',
          total: 40,
          avail: 14,
          price: 20,
          priceLabel: '₹20/hr (Bikes ₹10/hr)',
          open: '05:30',
          close: '23:30',
          contact: '+91-831-2401100',
          status: 'AVAILABLE',
        },
        {
          id: 'park-chennamma-2',
          name: 'Rani Chennamma Civic Lot',
          address: 'Near Rani Chennamma Circle, Court Road, Belagavi',
          lat: 15.8588,
          lng: 74.5051,
          type: 'CAR',
          total: 24,
          avail: 3,
          price: 30,
          priceLabel: '₹30/hr',
          open: '06:00',
          close: '22:00',
          contact: '+91-831-2402210',
          status: 'LIMITED',
        },
        {
          id: 'park-college-3',
          name: 'College Road Two-Wheeler Hub',
          address: 'Opp. Lingaraj College Campus, College Road, Belagavi',
          lat: 15.8551,
          lng: 74.4971,
          type: 'BIKE',
          total: 50,
          avail: 22,
          price: 10,
          priceLabel: '₹10/hr',
          open: '06:30',
          close: '22:30',
          contact: '+91-831-2403315',
          status: 'AVAILABLE',
        },
        {
          id: 'park-station-4',
          name: 'Railway Station Forecourt Bay',
          address: 'Belagavi Railway Station Main Entrance, Station Road',
          lat: 15.8464,
          lng: 74.5046,
          type: 'BOTH',
          total: 36,
          avail: 0,
          price: 25,
          priceLabel: '₹25/hr (Daily Pass ₹120)',
          open: '00:00',
          close: '23:59',
          contact: '+91-831-2404420',
          status: 'FULL',
        },
        {
          id: 'park-bogarves-5',
          name: 'Bogarves Market Basement Parking',
          address: 'Bogarves Commercial Complex, Belagavi',
          lat: 15.8501,
          lng: 74.5098,
          type: 'BOTH',
          total: 30,
          avail: 5,
          price: 20,
          priceLabel: '₹20/hr',
          open: '07:00',
          close: '22:00',
          contact: '+91-831-2405590',
          status: 'LIMITED',
        },
        {
          id: 'park-kle-6',
          name: 'KLE Medical Visitor Parkade',
          address: 'Nehru Nagar Medical Corridor, Belagavi',
          lat: 15.8691,
          lng: 74.5032,
          type: 'BOTH',
          total: 48,
          avail: 26,
          price: 15,
          priceLabel: '₹15/hr',
          open: '00:00',
          close: '23:59',
          contact: '+91-831-2473777',
          status: 'AVAILABLE',
        },
        {
          id: 'park-tilakwadi-7',
          name: 'Tilakwadi First Gate Lot',
          address: 'Congress Road South, Tilakwadi, Belagavi',
          lat: 15.8411,
          lng: 74.4926,
          type: 'CAR',
          total: 20,
          avail: 11,
          price: 15,
          priceLabel: '₹15/hr',
          open: '06:00',
          close: '22:00',
          contact: '+91-831-2467710',
          status: 'AVAILABLE',
        },
        {
          id: 'park-shahpur-8',
          name: 'Shahpur Market Free Civic Bay',
          address: 'Kacheri Galli Cross, Shahpur, Belagavi',
          lat: 15.8442,
          lng: 74.5116,
          type: 'BIKE',
          total: 32,
          avail: 18,
          price: 0,
          priceLabel: 'Free (Civic Zone)',
          open: '07:00',
          close: '21:30',
          contact: null,
          status: 'AVAILABLE',
        },
      ];

      for (const p of parkingSeed) {
        insertParking.run(
          p.id,
          p.name,
          p.address,
          p.lat,
          p.lng,
          p.type,
          p.total,
          p.avail,
          p.price,
          p.priceLabel,
          p.open,
          p.close,
          p.contact,
          p.status,
          now,
          now
        );
      }

      // Seed 1 sample active reservation for demo commuter so "My Reservations" is verifiable out of box
      db.prepare(`
        INSERT OR IGNORE INTO parking_reservations (
          id, user_id, parking_id, slot_number, vehicle_type, vehicle_number, reservation_time, duration_hours, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
      `).run(
        'pres-seed-1',
        'usr-commuter-1',
        'park-central-1',
        'S-03',
        'CAR',
        'KA-22-MG-4108',
        now,
        2,
        now,
        now
      );
    }

    // 3. Seed sample Bus Stops, Bus Routes, Route Stops, and Bus Schedules
    const stopCount = (db.prepare('SELECT COUNT(*) as cnt FROM bus_stops').get() as { cnt: number }).cnt;
    if (stopCount === 0) {
      const insertStop = db.prepare(`
        INSERT INTO bus_stops (id, stop_name, address, landmark, direction, latitude, longitude, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const stopsSeed = [
        { id: 'stop-central', name: 'Central Bus Terminus (CBT)', address: 'Station-Khade Bazaar Core, Belagavi', landmark: 'Main CBT Terminal Platform 1', dir: 'City Hub (All Directions)', lat: 15.8521, lng: 74.5011 },
        { id: 'stop-chennamma', name: 'Rani Chennamma Circle Stop', address: 'Chennamma Circle Rotary, Belagavi', landmark: 'Opposite District Court Arch', dir: 'Northbound / Eastbound', lat: 15.8586, lng: 74.5046 },
        { id: 'stop-college', name: 'College Road Bus Bay', address: 'College Road Plaza, Belagavi', landmark: 'Lingaraj College Main Gate', dir: 'North-South Commercial', lat: 15.8556, lng: 74.4976 },
        { id: 'stop-congress', name: 'Congress Road Junction Stop', address: 'Congress Road Arterial, Belagavi', landmark: 'Near Goaves Overbridge', dir: 'Southbound / Westbound', lat: 15.8471, lng: 74.4962 },
        { id: 'stop-tilakwadi', name: 'Tilakwadi First Gate Stop', address: 'Tilakwadi Main Road, Belagavi', landmark: 'First Railway Gate Crossing', dir: 'South Residential', lat: 15.8406, lng: 74.4922 },
        { id: 'stop-udyambag', name: 'Udyambag Industrial Gate', address: 'Udyambag MIDC Spine, Belagavi', landmark: 'Udyambag Main Arch', dir: 'Industrial South', lat: 15.8332, lng: 74.4997 },
        { id: 'stop-camp', name: 'Camp Artillery Chowk Stop', address: 'Cantonment Area, Belagavi', landmark: 'Artillery Centre Gate', dir: 'West Cantonment', lat: 15.8536, lng: 74.4877 },
        { id: 'stop-kle', name: 'KLE Hospital Medical Stop', address: 'Nehru Nagar Medical Corridor, Belagavi', landmark: 'KLE Prabhakar Kore Hospital Gate', dir: 'North Medical', lat: 15.8696, lng: 74.5026 },
        { id: 'stop-nehru', name: 'Nehru Nagar Bypass Terminal', address: 'Nehru Nagar Ring, Belagavi', landmark: 'VTU Feeder Junction', dir: 'North Bypass', lat: 15.8731, lng: 74.5146 },
        { id: 'stop-fort', name: 'Fort Lake Circle Stop', address: 'Fort Road East Arterial, Belagavi', landmark: 'Belagavi Fort Lake Garden', dir: 'East Corridor', lat: 15.8641, lng: 74.5131 },
        { id: 'stop-station', name: 'Railway Station Forecourt Stop', address: 'Belagavi Railway Station, Station Road', landmark: 'Station Main Ticket Concourse', dir: 'Rail Feeder Hub', lat: 15.8461, lng: 74.5042 },
        { id: 'stop-shahpur', name: 'Shahpur Market Stop', address: 'Shahpur Main Cross, Belagavi', landmark: 'Shahpur Municipal Market', dir: 'South-East Market', lat: 15.8446, lng: 74.5112 },
      ];

      for (const st of stopsSeed) {
        insertStop.run(st.id, st.name, st.address, st.landmark, st.dir, st.lat, st.lng, now);
      }

      const insertRoute = db.prepare(`
        INSERT INTO bus_routes (
          id, route_number, route_name, starting_point, destination, route_description,
          estimated_duration_min, frequency_min, service_start_time, service_end_time, service_status, is_sample, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `);

      const routesSeed = [
        {
          id: 'br-101',
          num: '101',
          name: 'CBT – KLE Medical Express',
          start: 'Central Bus Terminus (CBT)',
          dest: 'Nehru Nagar Bypass Terminal',
          desc: 'Core north-south medical corridor connecting CBT, Chennamma Circle, and KLE Hospital.',
          dur: 24,
          freq: 12,
          sTime: '05:45',
          eTime: '22:45',
          status: 'ON_SCHEDULE',
          stops: [
            { stopId: 'stop-central', order: 1, min: 0 },
            { stopId: 'stop-chennamma', order: 2, min: 6 },
            { stopId: 'stop-kle', order: 3, min: 16 },
            { stopId: 'stop-nehru', order: 4, min: 24 },
          ],
        },
        {
          id: 'br-204',
          num: '204',
          name: 'Udyambag – CBT Industrial Connector',
          start: 'Udyambag Industrial Gate',
          dest: 'Central Bus Terminus (CBT)',
          desc: 'Commuter feeder from Udyambag industrial area through Tilakwadi and Congress Road to CBT.',
          dur: 28,
          freq: 15,
          sTime: '06:00',
          eTime: '22:15',
          status: 'ON_SCHEDULE',
          stops: [
            { stopId: 'stop-udyambag', order: 1, min: 0 },
            { stopId: 'stop-tilakwadi', order: 2, min: 8 },
            { stopId: 'stop-congress', order: 3, min: 16 },
            { stopId: 'stop-college', order: 4, min: 22 },
            { stopId: 'stop-central', order: 5, min: 28 },
          ],
        },
        {
          id: 'br-308',
          num: '308',
          name: 'Railway Station – Fort Ring Shuttle',
          start: 'Railway Station Forecourt Stop',
          dest: 'Nehru Nagar Bypass Terminal',
          desc: 'Rail-to-ring east corridor serving Shahpur, CBT, Chennamma Circle, Fort Lake, and Nehru Nagar.',
          dur: 32,
          freq: 20,
          sTime: '05:30',
          eTime: '23:00',
          status: 'ON_SCHEDULE',
          stops: [
            { stopId: 'stop-station', order: 1, min: 0 },
            { stopId: 'stop-shahpur', order: 2, min: 6 },
            { stopId: 'stop-central', order: 3, min: 13 },
            { stopId: 'stop-chennamma', order: 4, min: 19 },
            { stopId: 'stop-fort', order: 5, min: 26 },
            { stopId: 'stop-nehru', order: 6, min: 32 },
          ],
        },
        {
          id: 'br-412',
          num: '412',
          name: 'Camp Cantonment – Shahpur Loop',
          start: 'Camp Artillery Chowk Stop',
          dest: 'Shahpur Market Stop',
          desc: 'Cross-city east-west connector linking Cantonment, College Road, Congress Road, Station, and Shahpur.',
          dur: 26,
          freq: 18,
          sTime: '06:15',
          eTime: '21:45',
          status: 'DELAYED',
          stops: [
            { stopId: 'stop-camp', order: 1, min: 0 },
            { stopId: 'stop-college', order: 2, min: 8 },
            { stopId: 'stop-congress', order: 3, min: 14 },
            { stopId: 'stop-station', order: 4, min: 20 },
            { stopId: 'stop-shahpur', order: 5, min: 26 },
          ],
        },
        {
          id: 'br-505',
          num: '505',
          name: 'Tilakwadi – KLE Campus Direct',
          start: 'Tilakwadi First Gate Stop',
          dest: 'KLE Hospital Medical Stop',
          desc: 'Student & hospital shuttle via Camp Cantonment and Rani Chennamma Circle.',
          dur: 29,
          freq: 20,
          sTime: '06:30',
          eTime: '21:30',
          status: 'ON_SCHEDULE',
          stops: [
            { stopId: 'stop-tilakwadi', order: 1, min: 0 },
            { stopId: 'stop-camp', order: 2, min: 9 },
            { stopId: 'stop-college', order: 3, min: 15 },
            { stopId: 'stop-chennamma', order: 4, min: 21 },
            { stopId: 'stop-kle', order: 5, min: 29 },
          ],
        },
      ];

      const insertRouteStop = db.prepare(`
        INSERT INTO bus_route_stops (id, route_id, stop_id, stop_order, travel_minutes_from_start)
        VALUES (?, ?, ?, ?, ?)
      `);

      const insertSchedule = db.prepare(`
        INSERT INTO bus_schedules (id, route_id, stop_id, scheduled_arrival, scheduled_departure, day_type, status, is_sample)
        VALUES (?, ?, ?, ?, ?, 'DAILY', ?, 1)
      `);

      let rsIdx = 1;
      let schIdx = 1;
      const sampleBaseHours = ['07:00', '08:30', '10:00', '12:15', '14:30', '17:00', '19:15'];

      const addMinutesToHhMm = (hhmm: string, mins: number) => {
        const [hh, mm] = hhmm.split(':').map(Number);
        const total = hh * 60 + mm + mins;
        const nh = Math.floor(total / 60) % 24;
        const nm = total % 60;
        return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
      };

      for (const rt of routesSeed) {
        insertRoute.run(
          rt.id,
          rt.num,
          rt.name,
          rt.start,
          rt.dest,
          rt.desc,
          rt.dur,
          rt.freq,
          rt.sTime,
          rt.eTime,
          rt.status,
          now
        );

        for (const st of rt.stops) {
          insertRouteStop.run(`brs-${rsIdx++}`, rt.id, st.stopId, st.order, st.min);
          for (const baseStart of sampleBaseHours.slice(0, 4)) {
            const arr = addMinutesToHhMm(baseStart, st.min);
            const dep = addMinutesToHhMm(arr, 1);
            insertSchedule.run(`bsch-${schIdx++}`, rt.id, st.stopId, arr, dep, rt.status);
          }
        }
      }
    }

    // 4. Seed sample personal emergency contacts for demo commuter
    const contactCount = (
      db.prepare('SELECT COUNT(*) as cnt FROM emergency_contacts').get() as { cnt: number }
    ).cnt;
    if (contactCount === 0) {
      const insertContact = db.prepare(`
        INSERT OR IGNORE INTO emergency_contacts (
          id, user_id, name, relationship, phone, notes, is_primary, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertContact.run(
        'ec-demo-1',
        'usr-commuter-1',
        'Priya Kulkarni',
        'Family / Spouse',
        '+91 98450 11223',
        'Primary emergency contact (Demo Sample)',
        1,
        now,
        now
      );
      insertContact.run(
        'ec-demo-2',
        'usr-commuter-1',
        'Dr. Siddharth Deshpande',
        'Family Physician',
        '+91 831 2478890',
        'Clinic near Camp Artillery Chowk (Demo Sample)',
        0,
        now,
        now
      );
    }
  });

  tx();
}

