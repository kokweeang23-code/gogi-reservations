import type { Express } from "express";
import type { Server } from "http";
import { z } from "zod";
import { storage, TIME_SLOTS } from "./storage";
import { insertReservationSchema } from "@shared/schema";

// Simple admin token (in production this would be env-based)
const ADMIN_TOKEN = "gogi-admin-2024";

function isAdmin(req: any): boolean {
  const auth = req.headers["x-admin-token"] || req.query.adminToken;
  return auth === ADMIN_TOKEN;
}

export function registerRoutes(httpServer: Server, app: Express) {
  // ─── Public: Time slots ─────────────────────────────────────────────────────
  app.get("/api/time-slots", (_req, res) => {
    res.json({ slots: TIME_SLOTS });
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

  // ─── Public: Create reservation ─────────────────────────────────────────────
  app.post("/api/reservations", (req, res) => {
    const parsed = insertReservationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }

    // Double-booking guard
    const avail = storage.checkAvailability(parsed.data.date, parsed.data.time, parsed.data.partySize);
    if (!avail.available) {
      return res.status(409).json({
        error: "No tables available for this time",
        availableSlots: avail.availableSlots,
      });
    }

    const reservation = storage.createReservation(parsed.data);

    // Generate WhatsApp confirmation URL (pre-filled message)
    const msg = encodeURIComponent(
      `🔥 Booking Confirmed — The Gogi @ Alexandra Central\n\n` +
      `Dear ${reservation.name},\n` +
      `Your reservation has been confirmed!\n\n` +
      `📅 Date: ${reservation.date}\n` +
      `⏰ Time: ${reservation.time}\n` +
      `👥 Party: ${reservation.partySize} pax\n\n` +
      `📍 321 Alexandra Rd, #02-01 Alexandra Central, Singapore 159971\n` +
      `📞 +65 8181 7221\n\n` +
      `See you soon! Please arrive 5 min early. Reply to cancel.`
    );

    // Phone number should be in international format, remove leading 0 or +
    const rawPhone = reservation.phone.replace(/\D/g, "");
    const phone = rawPhone.startsWith("65") ? rawPhone : `65${rawPhone}`;
    const whatsappUrl = `https://wa.me/${phone}?text=${msg}`;

    res.status(201).json({ reservation, whatsappUrl, confirmationMessage: decodeURIComponent(msg) });
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
