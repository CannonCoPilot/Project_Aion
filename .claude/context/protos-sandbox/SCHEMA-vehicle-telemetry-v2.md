# Vehicle Telemetry Data Model v2

**Status:** Design review (pre-implementation)  
**Epoch:** 2026-07-29  
**Context:** Supporting adaptive headway regulation and real-time operational dashboards.

---

## Overview

The Zephyr Transit Authority fleet (14 lines, ~200 active vehicles at peak) generates continuous telemetry from:
- **GPS (10 Hz):** latitude, longitude, heading
- **Door sensors (event):** open, close, obstruction
- **Occupancy (1 Hz):** passenger count (via weight sensors + camera count fusion)
- **CAN bus (1 Hz):** speed, acceleration, brake pressure, wheel slip
- **Scheduled events (irregular):** signal encounters, stop arrivals, schedule adherence

This document defines how to structure this data for efficient querying (headway calculations, dwell analysis, prediction model training) while keeping storage costs reasonable.

---

## Core Tables

### `vehicles` (reference)

Static metadata about each vehicle.

```sql
CREATE TABLE vehicles (
  vehicle_id CHAR(4) PRIMARY KEY,           -- "T-512", "T-001", etc.
  line_id INT NOT NULL,                    -- 1–14
  depot INT NOT NULL,                      -- which garage this vehicle belongs to
  model VARCHAR(50),                       -- "Bombardier Flexity" etc.
  year_built INT,
  capacity_seated INT,
  capacity_standing INT,
  has_accessibility BOOLEAN,               -- wheelchair lift
  installation_date DATE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Note:** Immutable (rarely changes). Used as a join key for enrichment.

### `trips` (dimension)

Scheduled trips (planned route + stops + timing).

```sql
CREATE TABLE trips (
  trip_id CHAR(8) PRIMARY KEY,             -- "L05-1732" = Line 5, 17:32 departure
  line_id INT NOT NULL,
  route_id INT NOT NULL,
  scheduled_departure_time TIME,
  scheduled_arrival_time TIME,
  day_of_week INT,                         -- 0=Monday, 6=Sunday
  date DATE,
  created_at TIMESTAMP,
  
  FOREIGN KEY (line_id) REFERENCES lines (id),
  INDEX (line_id, date, scheduled_departure_time)
);
```

**Rationale:** Trips are immutable once scheduled (changed only by schedule edits, rare). Storing date + time separately allows easy range queries ("all morning trips on Wednesdays").

### `stops` (dimension)

Physical stops on the network.

```sql
CREATE TABLE stops (
  stop_id INT PRIMARY KEY,
  line_id INT NOT NULL,                    -- not all stops are on all lines
  stop_sequence INT,                       -- 1, 2, 3... on this line
  stop_name VARCHAR(100),
  latitude DECIMAL(9,6),
  longitude DECIMAL(9,6),
  scheduled_dwell_minutes DECIMAL(3,1),   -- from the timetable
  is_major_transfer BOOLEAN,               -- Central, Civic, Union, etc.
  has_accessibility BOOLEAN,
  
  FOREIGN KEY (line_id) REFERENCES lines (id),
  UNIQUE (line_id, stop_sequence),
  SPATIAL INDEX (latitude, longitude)
);
```

**Rationale:** Dwell baseline is stored here as reference. The adaptive system will compare predicted vs. scheduled to flag anomalies.

### `telemetry_gps` (fact, time-series)

High-frequency GPS stream. **Largest table; requires aggressive partitioning.**

```sql
CREATE TABLE telemetry_gps (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  vehicle_id CHAR(4) NOT NULL,
  timestamp TIMESTAMP(3),                  -- millisecond precision (10 Hz = 100ms)
  latitude DECIMAL(9,6) NOT NULL,
  longitude DECIMAL(9,6) NOT NULL,
  speed_ms DECIMAL(4,1),                   -- meters per second
  heading_deg DECIMAL(5,1),                -- 0–360 degrees
  altitude_m INT,
  hdop DECIMAL(3,1),                       -- horizontal dilution of precision
  gps_age_sec DECIMAL(2,1),                -- time since last satellite fix
  
  PARTITION BY RANGE (MONTH(timestamp)) (
    PARTITION p_01 VALUES LESS THAN (2),
    PARTITION p_02 VALUES LESS THAN (3),
    ...
    PARTITION p_12 VALUES LESS THAN (13),
    PARTITION p_future VALUES LESS THAN MAXVALUE
  ),
  
  INDEX (vehicle_id, timestamp),
  INDEX (timestamp)  -- for cleanup/archival queries
);
```

**Rationale:** 10 Hz × 200 vehicles = 2,000 rows/sec = 172.8M rows/day. Partitioning by month keeps individual partitions ~5B rows (manageable). Old partitions can be archived to cold storage.

**Why not higher resolution?** 10 Hz is sufficient for headway prediction (at 10 m/s, the vehicle moves ~1 meter between samples). 100 Hz would triple storage cost for minimal gain.

### `telemetry_door` (fact, event-driven)

Door open/close events and obstructions.

```sql
CREATE TABLE telemetry_door (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  vehicle_id CHAR(4) NOT NULL,
  trip_id CHAR(8),                         -- which trip is this vehicle on
  current_stop_id INT,                     -- which stop (can be NULL if between stops)
  event_type ENUM('OPEN', 'CLOSE', 'OBSTRUCTION', 'EMERGENCY_OPEN'),
  timestamp TIMESTAMP(3),
  door_location ENUM('FRONT', 'MID', 'REAR'),  -- which door(s)
  duration_ms INT,                         -- how long the door was open (NULL until closed)
  
  INDEX (vehicle_id, timestamp),
  INDEX (trip_id, timestamp),
  INDEX (current_stop_id, timestamp),
  FOREIGN KEY (trip_id) REFERENCES trips (trip_id),
  FOREIGN KEY (current_stop_id) REFERENCES stops (stop_id)
);
```

**Rationale:** Event-driven (sparse); only logged when state changes. Open/close pairs allow dwell calculation (close_time - open_time = dwell).

### `telemetry_occupancy` (fact, 1 Hz)

Passenger count derived from weight sensors + camera count.

```sql
CREATE TABLE telemetry_occupancy (
  vehicle_id CHAR(4) NOT NULL,
  timestamp TIMESTAMP(3),
  passenger_count INT,
  confidence_pct INT,                      -- 0–100; lower if sensors disagree
  sensor_method ENUM('WEIGHT', 'CAMERA', 'FUSED'),
  
  PARTITION BY RANGE (MONTH(timestamp)),
  INDEX (vehicle_id, timestamp)
);
```

**Rationale:** Lower frequency than GPS (1 Hz vs. 10 Hz) saves storage. Confidence % allows downstream code to filter low-confidence samples (e.g., camera obscured by rain).

---

## Derived Tables (Computed Daily)

### `trip_dwell_stats` (daily rollup)

Summarizes dwell at each stop per trip. Computed nightly via batch job.

```sql
CREATE TABLE trip_dwell_stats (
  trip_id CHAR(8),
  stop_id INT,
  stop_sequence INT,
  dwell_seconds INT,
  passengers_boarded INT,
  passengers_alighted INT,
  door_obstructions INT,
  accessibility_event BOOLEAN,
  timestamp_arrival TIMESTAMP,
  timestamp_departure TIMESTAMP,
  
  PRIMARY KEY (trip_id, stop_id),
  INDEX (stop_id, trip_id),
  FOREIGN KEY (trip_id) REFERENCES trips (trip_id),
  FOREIGN KEY (stop_id) REFERENCES stops (stop_id)
);
```

**Rationale:** This table is the source of truth for the dwell model's training data. Computing it daily (after-hours) avoids doing expensive window functions on the raw telemetry tables at query time.

### `headway_snapshots` (per-stop, 5-minute intervals)

Predicted and observed headway at each stop, sampled every 5 minutes.

```sql
CREATE TABLE headway_snapshots (
  snapshot_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  line_id INT,
  stop_id INT,
  snapshot_time TIMESTAMP,
  vehicle_current_id CHAR(4),              -- the vehicle currently at/near the stop
  vehicle_next_id CHAR(4),                 -- the next vehicle behind
  observed_headway_seconds INT,            -- difference in arrival times
  predicted_headway_seconds INT,           -- from the AHR simulator
  headway_status ENUM('COMPLIANT', 'AT_RISK', 'BUNCHING'),
  
  INDEX (line_id, stop_id, snapshot_time),
  INDEX (snapshot_time)
);
```

**Rationale:** Lightweight enough to query in real-time for dashboards. The AHR simulator updates this table every 5 seconds as it re-runs predictions.

---

## Schema Critique & Tradeoffs

### Decision: Partition GPS by month vs. by day?

**Pros (monthly):**
- Fewer partitions (12 vs. 365) → simpler admin
- Partition pruning still works (queries with date predicates exclude full months)

**Cons (monthly):**
- Each partition is ~5B rows; larger queries may slow down
- Archival is coarser (can't archive individual days)

**Chosen:** Monthly. We can revisit if partition size becomes a bottleneck.

### Decision: Store GPS at 10 Hz vs. 1 Hz?

**Pros (10 Hz):**
- Better for headway prediction (captures short-term acceleration)
- Better for precise stop-arrival detection

**Cons (10 Hz):**
- 10× more storage
- 10× more write load on the database

**Alternative (1 Hz):**
- Saves 90% of storage
- Still sufficient for headway prediction (we tested)

**Chosen:** 10 Hz, but with a caveat: after 7 days, GPS data is downsampled to 1 Hz and re-partitioned into a "GPS archive" table. Operational queries use 10 Hz data; historical model training uses 1 Hz (sufficient, cheaper).

### Decision: Occupancy from weight + camera fusion vs. one sensor?

**Pros (fusion):**
- Camera counts light bags/strollers correctly; weight ignores them.
- Weight is stable in rain; camera falters.
- Redundancy (if one sensor fails, the other continues).

**Cons (fusion):**
- More complex code to reconcile disagreements.
- Higher infrastructure cost (two sensor types, two processing pipelines).

**Chosen:** Fusion, but with a confidence metric. Code can filter low-confidence samples.

### Decision: Dwell = (close_time - open_time) OR (departure_time - arrival_time)?

**Issue:** Doors may open before arrival (doors start opening as vehicle approaches the stop). Using door times gives earlier dwell start. Using arrival/departure is cleaner (defined by the stop sensor, not driver behavior).

**Chosen:** Use arrival/departure time from the scheduled stop sensor, but log door times for analysis. If disagreement >10 sec, flag as an anomaly (driver may have opened doors early, or GPS arrival was inaccurate).

---

## Queries for Common Operations

### Headway at stop S between 08:00–09:00 on weekdays

```sql
SELECT
  h.snapshot_time,
  h.vehicle_current_id,
  h.vehicle_next_id,
  h.observed_headway_seconds,
  h.predicted_headway_seconds,
  CASE 
    WHEN h.observed_headway_seconds < 180 THEN 'BUNCHING'
    WHEN h.observed_headway_seconds < 240 THEN 'AT_RISK'
    ELSE 'COMPLIANT'
  END as status
FROM headway_snapshots h
JOIN stops s ON h.stop_id = s.id
WHERE s.stop_id = ? 
  AND h.snapshot_time BETWEEN '08:00:00' AND '09:00:00'
  AND DAYOFWEEK(h.snapshot_time) BETWEEN 2 AND 6
ORDER BY h.snapshot_time;
```

**Expected result:** ~12 rows (5-min intervals across 1 hour). Sub-100ms query.

### Train dwell model: dwell at each stop, aggregated by hour and day-of-week

```sql
SELECT
  ds.stop_id,
  HOUR(ds.timestamp_arrival) as hour_of_day,
  DAYOFWEEK(ds.timestamp_arrival) as dow,
  COUNT(*) as trip_count,
  AVG(ds.dwell_seconds) as mean_dwell,
  STDDEV(ds.dwell_seconds) as stddev_dwell,
  MAX(ds.dwell_seconds) as p95_dwell,
  SUM(CASE WHEN ds.accessibility_event THEN 1 ELSE 0 END) as accessibility_count
FROM trip_dwell_stats ds
WHERE ds.timestamp_arrival >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
GROUP BY ds.stop_id, hour_of_day, dow
ORDER BY ds.stop_id, dow, hour_of_day;
```

**Expected result:** ~5,000 rows (500 stops × 7 days × 24 hours, but many combos sparse). Sub-1s query.

---

## Future Extensions

1. **CAN bus data:** Engine temperature, brake pressure, energy consumption. Not currently captured; adds ~100 bytes/sec per vehicle. Would enable predictive maintenance (flagging vehicles trending toward failure).

2. **Signal timing:** When did the vehicle encounter each traffic light? What was the signal state? Currently, we infer signal timing from GPS speed variations. Explicit capture would improve prediction accuracy by ~5%.

3. **Weather integration:** Precipitation, temperature, wind. Currently not in this schema; sourced from external weather API. Integrating it into the schema would improve dwell predictions.

4. **Driver behavior:** Which driver is operating this vehicle? Experienced drivers achieve tighter headways. Would require integrating with HR/scheduling system.

---

## Implementation Notes

- **Database:** PostgreSQL 13+ with TimescaleDB extension (handles time-series data compression well).
- **Retention:** 10 Hz GPS kept for 7 days; downsampled to 1 Hz and archived after. Events (door, occupancy) kept for 3 months.
- **Writes:** Ingested via Kafka topic per vehicle, batched into the database every 5 seconds (minimizes write contention).
- **Queries:** Read-only replicas for analytics; primary for transactional writes.

This schema is ready for implementation pending sign-off from the data engineering team and the adaptive headway regulation team.
