# Example query output

The queries are in [`sql/reports.sql`](../sql/reports.sql). This is the unedited output of `npm run reports` against a freshly seeded database on 2026-10-26. The seed data is random, so the numbers change each time you run `npm run db:seed`.

```text
1. Average soil moisture per zone per day (last 7 days)
          zone           |    day     | avg_moisture_pct | readings 
-------------------------+------------+------------------+----------
 Greenhouse A - Tomatoes | 2026-10-19 |             59.8 |       23
 Greenhouse A - Tomatoes | 2026-10-20 |             56.5 |      130
 Greenhouse A - Tomatoes | 2026-10-21 |             53.9 |      129
 Greenhouse A - Tomatoes | 2026-10-22 |             62.8 |      134
 Greenhouse A - Tomatoes | 2026-10-23 |             58.3 |      129
 Greenhouse A - Tomatoes | 2026-10-24 |             53.7 |      129
 Greenhouse A - Tomatoes | 2026-10-25 |             60.7 |      135
 Greenhouse A - Tomatoes | 2026-10-26 |             60.2 |      106
 North Field - Wheat     | 2026-10-19 |             41.7 |       22
 North Field - Wheat     | 2026-10-20 |             35.6 |      135
 North Field - Wheat     | 2026-10-21 |             37.9 |      141
 North Field - Wheat     | 2026-10-22 |             40.5 |      127
 North Field - Wheat     | 2026-10-23 |             31.0 |      129
 North Field - Wheat     | 2026-10-24 |             45.2 |      133
 North Field - Wheat     | 2026-10-25 |             35.5 |      133
 North Field - Wheat     | 2026-10-26 |             36.4 |      105
 Orchard Block 3 - Apple | 2026-10-19 |             52.6 |       24
 Orchard Block 3 - Apple | 2026-10-20 |             48.3 |      130
 Orchard Block 3 - Apple | 2026-10-21 |             41.1 |      137
 Orchard Block 3 - Apple | 2026-10-22 |             34.1 |      134
 Orchard Block 3 - Apple | 2026-10-23 |             41.9 |      130
 Orchard Block 3 - Apple | 2026-10-24 |             50.0 |      139
 Orchard Block 3 - Apple | 2026-10-25 |             42.8 |      132
 Orchard Block 3 - Apple | 2026-10-26 |             36.5 |      109
(24 rows)

2. Zones that need watering now (latest moisture below 30% and not already irrigating)
          zone           | latest_moisture_pct |     last_reading_at     | needs_water 
-------------------------+---------------------+-------------------------+-------------
 Orchard Block 3 - Apple |                33.3 | 2026-10-26 19:28:58.493 | f
 North Field - Wheat     |                45.9 | 2026-10-26 19:28:58.243 | f
 Greenhouse A - Tomatoes |                58.5 | 2026-10-26 19:28:56.469 | f
(3 rows)

3. Water used per zone per week
          zone           | week_starting | events | minutes | liters 
-------------------------+---------------+--------+---------+--------
 Greenhouse A - Tomatoes | 2026-09-28    |      2 |      30 |   1441
 North Field - Wheat     | 2026-09-28    |      3 |      45 |   2150
 Orchard Block 3 - Apple | 2026-09-28    |      2 |      30 |   1339
 Greenhouse A - Tomatoes | 2026-10-05    |      3 |      45 |   2227
 North Field - Wheat     | 2026-10-05    |      3 |      45 |   2009
 Orchard Block 3 - Apple | 2026-10-05    |      2 |      30 |   1498
 Greenhouse A - Tomatoes | 2026-10-12    |      2 |      30 |   1462
 North Field - Wheat     | 2026-10-12    |      2 |      30 |   1470
 Orchard Block 3 - Apple | 2026-10-12    |      1 |      15 |    789
 Greenhouse A - Tomatoes | 2026-10-19    |      2 |      30 |   1561
 North Field - Wheat     | 2026-10-19    |      3 |      45 |   2255
 Orchard Block 3 - Apple | 2026-10-19    |      2 |      30 |   1519
 North Field - Wheat     | 2026-10-26    |      1 |      15 |    682
(13 rows)

4. Anomaly rate per sensor (last 7 days), worst first
 serial_number |     type      | readings | anomalies | anomaly_pct 
---------------+---------------+----------+-----------+-------------
 SM-GHA-001    | SOIL_MOISTURE |      952 |        37 |         3.9
 SM-OB3-001    | SOIL_MOISTURE |      970 |        35 |         3.6
 SM-NF-001     | SOIL_MOISTURE |      959 |        34 |         3.5
 RAIN-OB3-001  | RAIN_GAUGE    |      957 |        29 |         3.0
 PH-GHA-001    | PH            |      956 |        29 |         3.0
 TMP-GHA-001   | TEMPERATURE   |      942 |        21 |         2.2
 TMP-NF-001    | TEMPERATURE   |      957 |        20 |         2.1
 FLOW-NF-001   | FLOW_RATE     |      959 |        16 |         1.7
(8 rows)

5. Daily water balance: rain vs evapotranspiration (last 7 days)
    day     | rain_mm | et0_mm | balance_mm 
------------+---------+--------+------------
 2026-10-19 |     0.0 |    3.1 |       -3.1
 2026-10-20 |    10.6 |    4.5 |        6.1
 2026-10-21 |     9.1 |    5.0 |        4.1
 2026-10-22 |     0.0 |    4.3 |       -4.3
 2026-10-23 |     0.0 |    4.4 |       -4.4
 2026-10-24 |     4.0 |    4.2 |       -0.2
 2026-10-25 |     6.9 |    4.5 |        2.4
 2026-10-26 |     7.3 |    4.5 |        2.7
(8 rows)

6. Sensors with no reading in the last hour
 serial_number | zone | last_reading_at 
---------------+------+-----------------
(0 rows)

```
