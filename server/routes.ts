import type { Express } from "express";
import type { Server } from "http";
import { z } from "zod";
import { storage, TIME_SLOTS, Storage } from "./storage";
import { insertReservationSchema } from "@shared/schema";
import { sendCustomerConfirmation, sendOwnerAlert } from "./email";

// Simple admin token
const ADMIN_TOKEN = "gogi-admin-2024";

// Owner WhatsApp number (Singapore)
const OWNER_PHONE = "6598212766";

function isAdmin(req: any): boolean {
  const auth = req.headers["x-admin-token"] || req.query.adminToken;
  return auth === ADMIN_TOKEN;
}

// Generate WhatsApp click-to-chat URL for owner alert
function ownerAlertUrl(reservation: any, coversBooked: number): string {
  const totalAfter = coversBooked + reservation.partySize;
  const msg = encodeURIComponent(
    `🔔 NEW BOOKING — The Gogi\n\n` +
    `👤 Guest: ${reservation.name}\n` +
    `📞 Phone: +65${reservation.phone.replace(/\D/g, "")}\n` +
    `📅 Date: ${reservation.date}\n` +
    `⏰ Time: ${reservation.time}\n` +
    `👥 Party: ${reservation.partySize} pax\n` +
    `${reservation.notes ? `📝 Notes: ${reservation.notes}\n` : ""}` +
    `\n📊 Slot load: ${totalAfter}/${Storage.MAX_COVERS_PER_SLOT} covers\n` +
    `🔗 Dashboard: https://www.perplexity.ai/computer/a/the-gogi-korean-bbq-reservatio-1MVmAMHmTwqUxVFEHuYhpg/go-admin.html`
  );
  return `https://wa.me/${OWNER_PHONE}?text=${msg}`;
}

export function registerRoutes(httpServer: Server, app: Express) {
  // ─── Simple echo test ───────────────────────────────────────
  app.post("/api/ping", (req, res) => {
    res.json({ pong: true, body: req.body });
  });

  // ─── Network connectivity test ─────────────────────────────────
  app.post("/api/test-webhook", async (req, res) => {
    const url = "https://hook.eu1.make.com/i22xy764naxf89509dbjir3x0r63b619";
    const start = Date.now();
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true, ts: new Date().toISOString() }),
      });
      const text = await r.text();
      res.json({ ok: true, status: r.status, body: text, ms: Date.now() - start });
    } catch (e: any) {
      res.json({ ok: false, error: e.message, cause: e.cause?.message, ms: Date.now() - start });
    }
  });

  // ─── Admin redirect — email clients strip # so we use an /api/ route ───
  // /api/* routes bypass Railway CDN and hit Express directly
  // Email link: https://www.perplexity.ai/computer/a/the-gogi-korean-bbq-reservatio-1MVmAMHmTwqUxVFEHuYhpg/go-admin.html
  app.get("/api/go-admin", (_req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Redirecting to Staff Dashboard...</title>
<script>
window.location.replace("https://www.perplexity.ai/computer/a/the-gogi-korean-bbq-reservatio-1MVmAMHmTwqUxVFEHuYhpg/#/admin");
</script></head><body><p>Redirecting to staff dashboard...</p></body></html>`);
  });

  // ─── Test email endpoint (remove after testing) ──────────────────────────
  app.get("/api/test-email", async (req, res) => {
    try {
      const testReservation = {
        id: 999,
        name: "Test Guest",
        phone: "98212766",
        email: "gogi.reservations@gmail.com",
        date: "2026-03-30",
        time: "19:00",
        partySize: 2,
        notes: "Test booking",
      };
      await sendOwnerAlert(testReservation, 10);
      await sendCustomerConfirmation(testReservation);
      res.json({ success: true, message: "Emails sent successfully" });
    } catch (err: any) {
      console.error("[EMAIL TEST FAIL]", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ─── Public: Time slots ─────────────────────────────────────────────────────
  app.get("/api/time-slots", (_req, res) => {
    res.json({ slots: TIME_SLOTS });
  });

  // ─── Public: Slot statuses for a date (available / filling / full) ───────────
  app.get("/api/slot-status", (req, res) => {
    const { date, partySize } = req.query as Record<string, string>;
    if (!date || !partySize) return res.status(400).json({ error: "date and partySize required" });
    const size = parseInt(partySize);
    const statuses: Record<string, { status: string; coversBooked: number; spotsLeft: number }> = {};
    for (const slot of TIME_SLOTS) {
      const covers = storage.getCoversInWindow(date, slot);
      const spotsLeft = Storage.MAX_COVERS_PER_SLOT - covers;
      let status: string;
      if (covers + size > Storage.MAX_COVERS_PER_SLOT) status = "full";
      else if (covers >= Storage.MAX_COVERS_PER_SLOT * 0.75) status = "filling";
      else status = "available";
      statuses[slot] = { status, coversBooked: covers, spotsLeft };
    }
    res.json(statuses);
  });

  // ─── Public: Check availability ─────────────────────────────────────────────
  app.post("/api/availability", (req, res) => {
    const schema = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      time: z.string().regex(/^\d{2}:\d{2}$/),
      partySize: z.number().int().min(1).max(15),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { date, time, partySize } = parsed.data;
    const result = storage.checkAvailability(date, time, partySize);
    res.json(result);
  });

  // ─── Public: Create reservation (status = pending until owner confirms) ─────────
  app.post("/api/reservations", (req, res) => {
    const parsed = insertReservationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }

    // Capacity guard — checks covers in 90-min window
    const avail = storage.checkAvailability(parsed.data.date, parsed.data.time, parsed.data.partySize);
    if (!avail.available) {
      return res.status(409).json({
        error: "This time slot is fully booked. Please choose another time.",
        availableSlots: avail.availableSlots,
      });
    }

    const reservation = storage.createReservation(parsed.data);

    // Owner alert WhatsApp URL (for dashboard use)
    const alertUrl = ownerAlertUrl(reservation, avail.coversBooked);

    // Respond immediately
    res.status(201).json({ reservation, ownerAlertUrl: alertUrl });

    // Fire Make.com webhook in background (non-blocking setTimeout to avoid blocking response)
    const snap = { ...reservation };
    const covers = avail.coversBooked;
    const makeUrl = process.env.MAKE_WEBHOOK_URL;
    setTimeout(() => {
      if (makeUrl) {
        fetch(makeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: snap.id,
            name: snap.name,
            phone: snap.phone,
            email: snap.email || "",
            date: snap.date,
            time: snap.time,
            partySize: snap.partySize,
            notes: snap.notes || "",
            coversAfter: covers + snap.partySize,
            dashboardUrl: "https://www.perplexity.ai/computer/a/the-gogi-korean-bbq-reservatio-1MVmAMHmTwqUxVFEHuYhpg/#/admin",
          }),
        })
          .then(async (r) => console.log(`[WEBHOOK OK] Make.com #${snap.id} status=${r.status}`))
          .catch((e: any) => console.error(`[WEBHOOK FAIL] Make.com #${snap.id}:`, e.message, e.cause?.message || ''));
      } else {
        console.error(`[WEBHOOK] MAKE_WEBHOOK_URL not set!`);
      }
    }, 100);
  });

  // ─── Admin: Confirm reservation (sends customer notification) ─────────────────
  app.patch("/api/admin/reservations/:id/confirm", (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    const id = parseInt(req.params.id);
    const updated = storage.updateReservationStatus(id, "confirmed");
    if (!updated) return res.status(404).json({ error: "Not found" });

    // Build customer WhatsApp URL
    const rawPhone = updated.phone.replace(/\D/g, "");
    const custPhone = rawPhone.startsWith("65") ? rawPhone : `65${rawPhone}`;
    const waMsg = encodeURIComponent(
      `🔥 Booking Confirmed — The Gogi @ Alexandra Central\n\n` +
      `Dear ${updated.name},\nYour reservation has been confirmed!\n\n` +
      `📅 Date: ${updated.date}\n⏰ Time: ${updated.time}\n👥 Party: ${updated.partySize} pax\n` +
      (updated.tableLabel ? `🪑 Table: ${updated.tableLabel}\n` : "") +
      `\n📍 321 Alexandra Rd, #02-01 Alexandra Central, S 159971\n📞 +65 8181 7221\n\n` +
      `See you soon! Please arrive 5 min early. To cancel, reply to this message.`
    );
    const whatsappUrl = `https://wa.me/${custPhone}?text=${waMsg}`;

    res.json({ reservation: updated, whatsappUrl });

    // Fire customer confirmation via Make.com webhook (non-blocking)
    const confirmedSnap = { ...updated };
    const confirmWebhookUrl = process.env.MAKE_CONFIRM_WEBHOOK_URL;
    setTimeout(() => {
      if (confirmWebhookUrl && confirmedSnap.email) {
        fetch(confirmWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: confirmedSnap.id,
            name: confirmedSnap.name,
            email: confirmedSnap.email,
            phone: confirmedSnap.phone,
            date: confirmedSnap.date,
            time: confirmedSnap.time,
            partySize: confirmedSnap.partySize,
            tableLabel: confirmedSnap.tableLabel || "",
            notes: confirmedSnap.notes || "",
          }),
        })
          .then(async (r) => console.log(`[CONFIRM WEBHOOK OK] #${confirmedSnap.id} status=${r.status}`))
          .catch((e: any) => console.error(`[CONFIRM WEBHOOK FAIL] #${confirmedSnap.id}:`, e.message, e.cause?.message || ''));
      }
    }, 100);
  });

  // ─── Admin: Get all reservations ────────────────────────────────────────────
  app.get("/api/admin/reservations", (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    const { date, from, to } = req.query as Record<string, string>;
    let data;
    if (date) {
      data = storage.getReservationsByDate(date);
    } else if (from && to) {
      data = storage.getReservationsByDateRange(from, to);
    } else {
      data = storage.getAllReservations();
    }
    res.json(data);
  });

  // ─── Admin: Stats ───────────────────────────────────────────────────────────
  app.get("/api/admin/stats", (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    res.json(storage.getStats());
  });

  // ─── Admin: Update reservation status ───────────────────────────────────────
  app.patch("/api/admin/reservations/:id/status", (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    const id = parseInt(req.params.id);
    const { status } = req.body;
    if (!["confirmed", "cancelled", "no_show"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const updated = storage.updateReservationStatus(id, status);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  // ─── Admin: Mark WhatsApp sent ───────────────────────────────────────────────
  app.patch("/api/admin/reservations/:id/whatsapp", (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    const id = parseInt(req.params.id);
    storage.markWhatsappSent(id);
    res.json({ success: true });
  });

  // ─── Admin: Assign table label ─────────────────────────────────────────────
  app.patch("/api/admin/reservations/:id/table", (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    const id = parseInt(req.params.id);
    const { tableLabel } = req.body;
    const updated = storage.updateTableAssignment(id, tableLabel ?? null);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  // ─── Admin: Delete reservation ──────────────────────────────────────────────
  app.delete("/api/admin/reservations/:id", (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    const id = parseInt(req.params.id);
    storage.deleteReservation(id);
    res.json({ success: true });
  });

  // ─── Admin: Get tables ──────────────────────────────────────────────────────
  app.get("/api/admin/tables", (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    res.json(storage.getAllTables());
  });

  // ─── Admin: Get reservations for a specific date (for calendar view) ────────
  app.get("/api/admin/calendar", (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    const { from, to } = req.query as Record<string, string>;
    if (!from || !to) return res.status(400).json({ error: "from and to required" });
    const data = storage.getReservationsByDateRange(from, to);
    // Group by date
    const grouped: Record<string, { count: number; covers: number }> = {};
    for (const r of data) {
      if (r.status === "cancelled") continue;
      if (!grouped[r.date]) grouped[r.date] = { count: 0, covers: 0 };
      grouped[r.date].count++;
      grouped[r.date].covers += r.partySize;
    }
    res.json(grouped);
  });
}
