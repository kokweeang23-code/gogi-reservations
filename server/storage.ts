import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, gte, lte, ne } from "drizzle-orm";
import { reservations, tables, settings } from "@shared/schema";
import type { Reservation, InsertReservation, Table, InsertTable } from "@shared/schema";

// Use /tmp for Railway (writable persistent-ish path), fallback to local for dev
const DB_PATH = process.env.NODE_ENV === "production" ? "/tmp/gogi.db" : "gogi.db";
const sqlite = new Database(DB_PATH);
export const db = drizzle(sqlite);

// ─── Bootstrap DB ─────────────────────────────────────────────────────────────
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    party_size INTEGER NOT NULL,
    table_id INTEGER,
    table_label TEXT,
    status TEXT NOT NULL DEFAULT 'confirmed',
    notes TEXT,
    created_at TEXT NOT NULL,
    whatsapp_sent INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    min_capacity INTEGER NOT NULL DEFAULT 1,
    type TEXT NOT NULL DEFAULT 'standard',
    is_active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Safely add table_label column to existing databases
try { sqlite.exec('ALTER TABLE reservations ADD COLUMN table_label TEXT'); } catch (_) {}

// Seed default tables if none exist
const existingTables = db.select().from(tables).all();
if (existingTables.length === 0) {
  const defaultTables: InsertTable[] = [
    // 2-pax tables
    { name: "T01", capacity: 2, minCapacity: 1, type: "standard", isActive: 1 },
    { name: "T02", capacity: 2, minCapacity: 1, type: "standard", isActive: 1 },
    { name: "T03", capacity: 2, minCapacity: 1, type: "standard", isActive: 1 },
    { name: "T04", capacity: 2, minCapacity: 1, type: "standard", isActive: 1 },
    // 4-pax tables
    { name: "T05", capacity: 4, minCapacity: 2, type: "standard", isActive: 1 },
    { name: "T06", capacity: 4, minCapacity: 2, type: "standard", isActive: 1 },
    { name: "T07", capacity: 4, minCapacity: 2, type: "standard", isActive: 1 },
    { name: "T08", capacity: 4, minCapacity: 2, type: "standard", isActive: 1 },
    { name: "T09", capacity: 4, minCapacity: 2, type: "standard", isActive: 1 },
    { name: "T10", capacity: 4, minCapacity: 2, type: "standard", isActive: 1 },
    // 6-pax booths
    { name: "B01", capacity: 6, minCapacity: 4, type: "booth", isActive: 1 },
    { name: "B02", capacity: 6, minCapacity: 4, type: "booth", isActive: 1 },
    { name: "B03", capacity: 6, minCapacity: 4, type: "booth", isActive: 1 },
    { name: "B04", capacity: 6, minCapacity: 4, type: "booth", isActive: 1 },
    // 8-pax booths
    { name: "B05", capacity: 8, minCapacity: 6, type: "booth", isActive: 1 },
    { name: "B06", capacity: 8, minCapacity: 6, type: "booth", isActive: 1 },
    { name: "B07", capacity: 8, minCapacity: 6, type: "booth", isActive: 1 },
    // VIP private rooms
    { name: "VIP1", capacity: 10, minCapacity: 8, type: "vip", isActive: 1 },
    { name: "VIP2", capacity: 12, minCapacity: 8, type: "vip", isActive: 1 },
    { name: "VIP3", capacity: 15, minCapacity: 10, type: "vip", isActive: 1 },
  ];
  for (const t of defaultTables) {
    db.insert(tables).values(t).run();
  }
}

// ─── Storage Interface ────────────────────────────────────────────────────────
export interface IStorage {
  // Reservations
  getAllReservations(): Reservation[];
  getReservationById(id: number): Reservation | undefined;
  getReservationsByDate(date: string): Reservation[];
  getReservationsByDateRange(from: string, to: string): Reservation[];
  createReservation(data: InsertReservation): Reservation;
  updateReservationStatus(id: number, status: string): Reservation | undefined;
  updateReservation(id: number, data: Partial<InsertReservation>): Reservation | undefined;
  deleteReservation(id: number): void;
  markWhatsappSent(id: number): void;
  // Availability
  checkAvailability(date: string, time: string, partySize: number): {
    available: boolean;
    availableSlots: string[];
    suggestedTable: Table | null;
  };
  // Tables
  getAllTables(): Table[];
  // Stats
  getStats(): {
    todayCount: number;
    weekCount: number;
    todayCovers: number;
    weekCovers: number;
    upcomingToday: Reservation[];
  };
}

function generateTimeSlots(): string[] {
  const slots: string[] = [];
  // Lunch: 11:00 - 15:00 (last seating 14:30, 90 min dining = done by 15:00 = break start)
  for (let h = 11; h <= 14; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    if (h < 14) slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  // Dinner: 17:00 - 23:00 (last seating 22:30)
  for (let h = 17; h <= 22; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  return slots;
}

export const TIME_SLOTS = generateTimeSlots();

class Storage implements IStorage {
  getAllReservations(): Reservation[] {
    return db.select().from(reservations).all();
  }

  getReservationById(id: number): Reservation | undefined {
    return db.select().from(reservations).where(eq(reservations.id, id)).get();
  }

  getReservationsByDate(date: string): Reservation[] {
    return db.select().from(reservations)
      .where(and(eq(reservations.date, date), ne(reservations.status, "cancelled")))
      .all();
  }

  getReservationsByDateRange(from: string, to: string): Reservation[] {
    return db.select().from(reservations)
      .where(and(gte(reservations.date, from), lte(reservations.date, to)))
      .all();
  }

  createReservation(data: InsertReservation): Reservation {
    const now = new Date().toISOString();
    const result = db.insert(reservations).values({
      ...data,
      status: "confirmed",
      createdAt: now,
      whatsappSent: 0,
      tableId: null, // owner assigns manually via dashboard
    }).returning().get();
    return result;
  }

  updateReservationStatus(id: number, status: string): Reservation | undefined {
    return db.update(reservations)
      .set({ status })
      .where(eq(reservations.id, id))
      .returning().get();
  }

  updateReservation(id: number, data: Partial<InsertReservation>): Reservation | undefined {
    return db.update(reservations)
      .set(data)
      .where(eq(reservations.id, id))
      .returning().get();
  }

  deleteReservation(id: number): void {
    db.delete(reservations).where(eq(reservations.id, id)).run();
  }

  markWhatsappSent(id: number): void {
    db.update(reservations).set({ whatsappSent: 1 }).where(eq(reservations.id, id)).run();
  }

  updateTableAssignment(id: number, tableLabel: string | null): Reservation | undefined {
    return db.update(reservations)
      .set({ tableLabel: tableLabel?.trim() || null })
      .where(eq(reservations.id, id))
      .returning().get();
  }

  private getOccupiedTableIds(date: string, time: string): Set<number> {
    // A slot is "occupied" if another confirmed reservation exists within ±90min
    const allDayRes = db.select().from(reservations)
      .where(and(eq(reservations.date, date), ne(reservations.status, "cancelled")))
      .all();

    const [reqH, reqM] = time.split(":").map(Number);
    const reqMinutes = reqH * 60 + reqM;

    const occupied = new Set<number>();
    for (const r of allDayRes) {
      const [rH, rM] = r.time.split(":").map(Number);
      const rMinutes = rH * 60 + rM;
      if (Math.abs(reqMinutes - rMinutes) < 90 && r.tableId) {
        occupied.add(r.tableId);
      }
    }
    return occupied;
  }

  private findBestTable(date: string, time: string, partySize: number): Table | null {
    const occupied = this.getOccupiedTableIds(date, time);
    const allTables = db.select().from(tables)
      .where(eq(tables.isActive, 1))
      .all()
      .filter(t => !occupied.has(t.id) && t.capacity >= partySize && t.minCapacity <= partySize)
      .sort((a, b) => a.capacity - b.capacity); // prefer smallest fitting table
    return allTables[0] ?? null;
  }

  checkAvailability(date: string, time: string, partySize: number): {
    available: boolean;
    availableSlots: string[];
    suggestedTable: Table | null;
  } {
    const suggestedTable = this.findBestTable(date, time, partySize);

    // Find all available slots for that date
    const availableSlots = TIME_SLOTS.filter(slot => {
      return this.findBestTable(date, slot, partySize) !== null;
    });

    return {
      available: suggestedTable !== null,
      availableSlots,
      suggestedTable,
    };
  }

  getAllTables(): Table[] {
    return db.select().from(tables).all();
  }

  getStats() {
    const today = new Date().toISOString().split("T")[0];
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStartStr = weekStart.toISOString().split("T")[0];
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + (6 - weekEnd.getDay()));
    const weekEndStr = weekEnd.toISOString().split("T")[0];

    const todayRes = db.select().from(reservations)
      .where(and(eq(reservations.date, today), ne(reservations.status, "cancelled")))
      .all();

    const weekRes = db.select().from(reservations)
      .where(and(gte(reservations.date, weekStartStr), lte(reservations.date, weekEndStr), ne(reservations.status, "cancelled")))
      .all();

    const nowHHMM = new Date().toTimeString().slice(0, 5);
    const upcomingToday = todayRes.filter(r => r.time >= nowHHMM).sort((a, b) => a.time.localeCompare(b.time)).slice(0, 10);

    return {
      todayCount: todayRes.length,
      weekCount: weekRes.length,
      todayCovers: todayRes.reduce((s, r) => s + r.partySize, 0),
      weekCovers: weekRes.reduce((s, r) => s + r.partySize, 0),
      upcomingToday,
    };
  }
}

export const storage = new Storage();
