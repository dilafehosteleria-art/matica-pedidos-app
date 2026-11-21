const baseUrl = process.env.HOLIDAY_SYNC_BASE_URL?.replace(/\/$/, "");
const secret = process.env.CRON_SECRET;

if (!baseUrl || !secret) {
  console.error("HOLIDAY_SYNC_BASE_URL y CRON_SECRET son obligatorios.");
  process.exit(1);
}

const response = await fetch(`${baseUrl}/api/cron/sync-official-holidays`, {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}` },
  signal: AbortSignal.timeout(60_000)
});
const body = await response.text();

if (!response.ok) {
  console.error(`La sincronización de festivos falló (${response.status}): ${body}`);
  process.exit(1);
}

console.log(body);
