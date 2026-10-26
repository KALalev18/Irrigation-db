-- Reporting queries for the irrigation database.
-- Run all of them against the Docker database with: npm run reports
-- Readings flagged as anomalies are excluded from averages throughout.

\echo '1. Average soil moisture per zone per day (last 7 days)'
SELECT z.name                               AS zone,
       date_trunc('day', r.recorded_at)::date AS day,
       round(avg(r.value)::numeric, 1)      AS avg_moisture_pct,
       count(*)                             AS readings
FROM sensor_readings r
JOIN sensors s ON s.id = r.sensor_id
JOIN zones z   ON z.id = s.zone_id
WHERE s.type = 'SOIL_MOISTURE'
  AND NOT r.is_anomaly
  AND r.recorded_at >= now() - interval '7 days'
GROUP BY z.name, day
ORDER BY z.name, day;

\echo '2. Zones that need watering now (latest moisture below 30% and not already irrigating)'
-- DISTINCT ON picks the newest valid reading per sensor; the unique
-- (sensor_id, recorded_at DESC) index lets Postgres read it without sorting.
WITH latest AS (
  SELECT DISTINCT ON (r.sensor_id) r.sensor_id, r.value, r.recorded_at
  FROM sensor_readings r
  WHERE NOT r.is_anomaly
  ORDER BY r.sensor_id, r.recorded_at DESC
)
SELECT z.name                          AS zone,
       round(avg(l.value)::numeric, 1) AS latest_moisture_pct,
       max(l.recorded_at)              AS last_reading_at,
       avg(l.value) < 30               AS needs_water
FROM latest l
JOIN sensors s ON s.id = l.sensor_id AND s.type = 'SOIL_MOISTURE' AND s.is_active
JOIN zones z   ON z.id = s.zone_id
WHERE NOT EXISTS (
  SELECT 1 FROM irrigation_events e WHERE e.zone_id = z.id AND e.status = 'ACTIVE'
)
GROUP BY z.name
ORDER BY latest_moisture_pct;

\echo '3. Water used per zone per week'
SELECT z.name                                 AS zone,
       date_trunc('week', e.started_at)::date AS week_starting,
       count(*)                               AS events,
       round(sum(e.duration_sec) / 60.0)      AS minutes,
       round(sum(e.volume_liters)::numeric)   AS liters
FROM irrigation_events e
JOIN zones z ON z.id = e.zone_id
WHERE e.status = 'COMPLETED'
GROUP BY z.name, week_starting
ORDER BY week_starting, z.name;

\echo '4. Anomaly rate per sensor (last 7 days), worst first'
SELECT s.serial_number,
       s.type,
       count(*)                                                       AS readings,
       count(*) FILTER (WHERE r.is_anomaly)                           AS anomalies,
       round(100.0 * count(*) FILTER (WHERE r.is_anomaly) / count(*), 1) AS anomaly_pct
FROM sensor_readings r
JOIN sensors s ON s.id = r.sensor_id
WHERE r.recorded_at >= now() - interval '7 days'
GROUP BY s.serial_number, s.type
ORDER BY anomaly_pct DESC;

\echo '5. Daily water balance: rain vs evapotranspiration (last 7 days)'
-- ET0 is stored as a mm/day rate on each hourly snapshot, so it is averaged, not summed.
SELECT date_trunc('day', recorded_at)::date         AS day,
       round(sum(precipitation_mm)::numeric, 1)     AS rain_mm,
       round(avg(evapotranspiration_mm)::numeric, 1) AS et0_mm,
       round((sum(precipitation_mm) - avg(evapotranspiration_mm))::numeric, 1) AS balance_mm
FROM weather_snapshots
WHERE recorded_at >= now() - interval '7 days'
GROUP BY day
ORDER BY day;

\echo '6. Sensors with no reading in the last hour'
SELECT s.serial_number,
       z.name             AS zone,
       max(r.recorded_at) AS last_reading_at
FROM sensors s
JOIN zones z ON z.id = s.zone_id
LEFT JOIN sensor_readings r ON r.sensor_id = s.id
WHERE s.is_active
GROUP BY s.serial_number, z.name
HAVING max(r.recorded_at) IS NULL OR max(r.recorded_at) < now() - interval '1 hour'
ORDER BY last_reading_at NULLS FIRST;
