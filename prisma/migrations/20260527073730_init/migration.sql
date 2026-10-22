-- CreateEnum
CREATE TYPE "SensorType" AS ENUM ('SOIL_MOISTURE', 'TEMPERATURE', 'FLOW_RATE', 'RAIN_GAUGE', 'PH');

-- CreateEnum
CREATE TYPE "IrrigationTrigger" AS ENUM ('SCHEDULED', 'MANUAL', 'SENSOR_THRESHOLD', 'WEATHER_ADJUSTED');

-- CreateEnum
CREATE TYPE "IrrigationEventStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "area_m2" DOUBLE PRECISION NOT NULL,
    "crop_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensors" (
    "id" TEXT NOT NULL,
    "zone_id" TEXT NOT NULL,
    "serial_number" TEXT NOT NULL,
    "type" "SensorType" NOT NULL,
    "unit" TEXT NOT NULL,
    "min_value" DOUBLE PRECISION NOT NULL,
    "max_value" DOUBLE PRECISION NOT NULL,
    "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sensors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensor_readings" (
    "id" BIGSERIAL NOT NULL,
    "sensor_id" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "is_anomaly" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sensor_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weather_snapshots" (
    "id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "temperature_c" DOUBLE PRECISION NOT NULL,
    "humidity_pct" DOUBLE PRECISION NOT NULL,
    "precipitation_mm" DOUBLE PRECISION NOT NULL,
    "wind_speed_ms" DOUBLE PRECISION NOT NULL,
    "evapotranspiration_mm" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "weather_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "irrigation_events" (
    "id" TEXT NOT NULL,
    "zone_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "duration_sec" INTEGER,
    "volume_liters" DOUBLE PRECISION,
    "trigger" "IrrigationTrigger" NOT NULL,
    "status" "IrrigationEventStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,

    CONSTRAINT "irrigation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "zone_id" TEXT NOT NULL,
    "cron_expr" TEXT NOT NULL,
    "duration_sec" INTEGER NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "zones_name_key" ON "zones"("name");

-- CreateIndex
CREATE UNIQUE INDEX "sensors_serial_number_key" ON "sensors"("serial_number");

-- CreateIndex
CREATE INDEX "sensors_zone_id_idx" ON "sensors"("zone_id");

-- CreateIndex
CREATE INDEX "sensors_type_is_active_idx" ON "sensors"("type", "is_active");

-- CreateIndex
CREATE INDEX "sensor_readings_sensor_id_recorded_at_idx" ON "sensor_readings"("sensor_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "sensor_readings_recorded_at_idx" ON "sensor_readings"("recorded_at");

-- CreateIndex
CREATE INDEX "weather_snapshots_recorded_at_idx" ON "weather_snapshots"("recorded_at" DESC);

-- CreateIndex
CREATE INDEX "irrigation_events_zone_id_started_at_idx" ON "irrigation_events"("zone_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "irrigation_events_status_idx" ON "irrigation_events"("status");

-- CreateIndex
CREATE INDEX "schedules_zone_id_is_enabled_idx" ON "schedules"("zone_id", "is_enabled");

-- AddForeignKey
ALTER TABLE "sensors" ADD CONSTRAINT "sensors_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensor_readings" ADD CONSTRAINT "sensor_readings_sensor_id_fkey" FOREIGN KEY ("sensor_id") REFERENCES "sensors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "irrigation_events" ADD CONSTRAINT "irrigation_events_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
