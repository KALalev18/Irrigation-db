-- Remove duplicate readings (same sensor, same timestamp) left by earlier
-- replays, keeping the first row, so the unique index can be created.
DELETE FROM "sensor_readings" a
USING "sensor_readings" b
WHERE a."sensor_id" = b."sensor_id"
  AND a."recorded_at" = b."recorded_at"
  AND a."id" > b."id";

-- Same columns as before, now unique: a replayed batch is skipped instead of stored twice.
DROP INDEX "sensor_readings_sensor_id_recorded_at_idx";
CREATE UNIQUE INDEX "sensor_readings_sensor_id_recorded_at_key" ON "sensor_readings"("sensor_id", "recorded_at" DESC);

-- CHECK constraints (Prisma can't express these, so they live in raw SQL).
-- They mirror the Zod rules, so bad data is rejected even if it bypasses the API.
-- sensor_readings.value deliberately has none: out-of-range readings are stored and flagged.
ALTER TABLE "zones"
  ADD CONSTRAINT "zones_area_positive" CHECK ("area_m2" > 0);

ALTER TABLE "sensors"
  ADD CONSTRAINT "sensors_calibration_range" CHECK ("max_value" > "min_value");

ALTER TABLE "weather_snapshots"
  ADD CONSTRAINT "weather_temperature_range" CHECK ("temperature_c" BETWEEN -60 AND 60),
  ADD CONSTRAINT "weather_humidity_range" CHECK ("humidity_pct" BETWEEN 0 AND 100),
  ADD CONSTRAINT "weather_precipitation_non_negative" CHECK ("precipitation_mm" >= 0),
  ADD CONSTRAINT "weather_wind_non_negative" CHECK ("wind_speed_ms" >= 0),
  ADD CONSTRAINT "weather_et0_non_negative" CHECK ("evapotranspiration_mm" >= 0);

ALTER TABLE "irrigation_events"
  ADD CONSTRAINT "irrigation_duration_positive" CHECK ("duration_sec" > 0),
  ADD CONSTRAINT "irrigation_volume_non_negative" CHECK ("volume_liters" >= 0),
  ADD CONSTRAINT "irrigation_ends_after_start" CHECK ("ended_at" >= "started_at");

ALTER TABLE "schedules"
  ADD CONSTRAINT "schedules_duration_range" CHECK ("duration_sec" BETWEEN 30 AND 86400);
