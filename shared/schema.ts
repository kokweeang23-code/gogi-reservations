import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Reservations ─────────────────────────────────────────────────────────────
export const reservations = sqliteTable("reservations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  date: text("date").notNull(),          // "YYYY-MM-DD"
  time: text("time").notNull(),          // "11:00", "11:30", etc.
  partySize: integer("party_size").notNull(),
  tableId: integer("table_id"),          // kept for internal use
  tableLabel: text("table_label"),        // owner-assigned label e.g. "T5", "Window 2"
  status: text("status").notNull().default("confirmed"), // "confirmed" | "cancelled" | "no_show"
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  whatsappSent: integer("whatsapp_sent").notNull().default(0), // 0 or 1
});

export const insertReservationSchema = createInsertSchema(reservations).omit({
  id: true,
  createdAt: true,
  whatsappSent: true,
  tableId: true,
  status: true,
});

export type InsertReservation = z.infer<typeof insertReservationSchema>;
export type Reservation = typeof reservations.$inferSelect;

// ─── Tables / Seating ─────────────────────────────────────────────────────────
export const tables = sqliteTable("tables", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),           // "T1", "B2", "VIP3"
  capacity: integer("capacity").notNull(),
  minCapacity: integer("min_capacity").notNull().default(1),
  type: text("type").notNull().default("standard"), // "standard" | "booth" | "vip"
  isActive: integer("is_active").notNull().default(1),
});

export const insertTableSchema = createInsertSchema(tables).omit({ id: true });
export type InsertTable = z.infer<typeof insertTableSchema>;
export type Table = typeof tables.$inferSelect;

// ─── Admin Settings ───────────────────────────────────────────────────────────
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
