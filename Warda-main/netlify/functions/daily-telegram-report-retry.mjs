// Dashboard-only build: report delivery scheduling is intentionally removed.
export default async function disabledTelegramReportSchedule() {
  return new Response('Disabled: all reports are inside the Dashboard Mini App.', { status: 200 });
}
