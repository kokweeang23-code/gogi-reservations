import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, API_BASE } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar, Clock, Users, Phone, Mail, CheckCircle2, XCircle, AlertCircle,
  MessageCircle, Search, Download, ChevronLeft, ChevronRight, TrendingUp, Flame, LogIn
} from "lucide-react";
import { useLocation } from "wouter";
import { format, addDays, subDays, startOfWeek, endOfWeek } from "date-fns";
import type { Reservation } from "@shared/schema";

const ADMIN_TOKEN = "gogi-admin-2024";

// ─── Auth Gate ───────────────────────────────────────────────────────────────
function AuthGate({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);

  if (token === ADMIN_TOKEN) return <>{children}</>;

  return (
    <div className="min-h-screen bg-[#1e1a16] flex items-center justify-center px-4">
      <div className="bg-card rounded-2xl border border-border p-8 w-full max-w-sm text-center shadow-xl">
        <GogiLogo />
        <h1 className="text-xl font-bold mt-4 mb-1">Staff Dashboard</h1>
        <p className="text-muted-foreground text-sm mb-6">Enter your access code</p>
        <Input
          type="password"
          placeholder="Access code"
          value={input}
          onChange={e => { setInput(e.target.value); setError(false); }}
          className={error ? "border-destructive mb-2" : "mb-2"}
          onKeyDown={e => e.key === "Enter" && (input === ADMIN_TOKEN ? setToken(input) : setError(true))}
          data-testid="input-admin-token"
        />
        {error && <p className="text-destructive text-xs mb-3">Incorrect access code</p>}
        <Button
          className="w-full bg-primary hover:bg-primary/90"
          onClick={() => input === ADMIN_TOKEN ? setToken(input) : setError(true)}
          data-testid="button-admin-login"
        >
          <LogIn className="w-4 h-4 mr-2" /> Sign In
        </Button>
      </div>
    </div>
  );
}

// ─── Back button (uses wouter navigation, works in iframe) ──────────────────
function BackToBooking() {
  const [, navigate] = useLocation();
  return (
    <button
      onClick={() => navigate("/")}
      className="text-white/40 hover:text-white/70 text-xs transition-colors cursor-pointer bg-transparent border-none"
    >
      ← Booking Page
    </button>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export default function AdminPage() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}

function Dashboard() {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("today");

  const headers = { "x-admin-token": ADMIN_TOKEN };

  // Stats
  const { data: stats, isLoading: statsLoading } = useQuery<{
    todayCount: number; weekCount: number; todayCovers: number; weekCovers: number;
    upcomingToday: Reservation[];
  }>({
    queryKey: ["/api/admin/stats"],
    queryFn: () => fetch(`${API_BASE}/api/admin/stats`, { headers }).then(r => r.json()),
    refetchInterval: 30000,
  });

  // Reservations for selected date
  const { data: dayRes = [], isLoading: dayLoading } = useQuery<Reservation[]>({
    queryKey: ["/api/admin/reservations", selectedDate],
    queryFn: () => fetch(`${API_BASE}/api/admin/reservations?date=${selectedDate}`, { headers }).then(r => r.json()),
    refetchInterval: 30000,
  });

  // All reservations (for search)
  const { data: allRes = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/admin/reservations"],
    queryFn: () => fetch(`${API_BASE}/api/admin/reservations`, { headers }).then(r => r.json()),
  });

  // Calendar data for current week
  const weekStart = format(startOfWeek(new Date(selectedDate), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(new Date(selectedDate), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const { data: calendarData = {} } = useQuery<Record<string, { count: number; covers: number }>>({
    queryKey: ["/api/admin/calendar", weekStart, weekEnd],
    queryFn: () => fetch(`${API_BASE}/api/admin/calendar?from=${weekStart}&to=${weekEnd}`, { headers }).then(r => r.json()),
  });

  // Table assignment mutation
  const tableMutation = useMutation({
    mutationFn: ({ id, label }: { id: number; label: string }) =>
      fetch(`${API_BASE}/api/admin/reservations/${id}/table`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ tableLabel: label || null }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reservations"] });
    },
  });

  // Status mutation
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      fetch(`${API_BASE}/api/admin/reservations/${id}/status`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Status updated" });
    },
  });

  // Search filter
  const searchResults = search.length > 1
    ? allRes.filter(r =>
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.phone.includes(search) ||
        r.date.includes(search)
      )
    : [];

  // Export CSV
  const exportCSV = () => {
    const rows = [
      ["ID", "Name", "Phone", "Email", "Date", "Time", "Party", "Table", "Status", "Notes", "Created"],
      ...dayRes.map(r => [r.id, r.name, r.phone, r.email ?? "", r.date, r.time, r.partySize, r.tableId ?? "", r.status, r.notes ?? "", r.createdAt]),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gogi-reservations-${selectedDate}.csv`;
    a.click();
  };

  // WhatsApp link generator
  const getWALink = (r: Reservation) => {
    const msg = encodeURIComponent(
      `🔥 Booking Confirmed — The Gogi @ Alexandra Central\n\nDear ${r.name},\nYour reservation has been confirmed!\n\n📅 Date: ${r.date}\n⏰ Time: ${r.time}\n👥 Party: ${r.partySize} pax\n\n📍 321 Alexandra Rd, #02-01 Alexandra Central, Singapore 159971\n📞 +65 8181 7221\n\nSee you soon!`
    );
    const phone = r.phone.replace(/\D/g, "");
    const intlPhone = phone.startsWith("65") ? phone : `65${phone}`;
    return `https://wa.me/${intlPhone}?text=${msg}`;
  };

  // Week calendar days
  const weekDays: string[] = [];
  for (let i = 0; i < 7; i++) {
    weekDays.push(format(addDays(new Date(weekStart), i), "yyyy-MM-dd"));
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-[#1e1a16] border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GogiLogo />
          <div>
            <p className="text-white font-bold text-base leading-none">The Gogi</p>
            <p className="text-white/40 text-xs">Staff Dashboard</p>
          </div>
        </div>
        <BackToBooking />
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard
            label="Today's Bookings"
            value={statsLoading ? "—" : String(stats?.todayCount ?? 0)}
            sub="reservations"
            icon={<Calendar className="w-4 h-4" />}
            color="primary"
          />
          <KPICard
            label="Today's Covers"
            value={statsLoading ? "—" : String(stats?.todayCovers ?? 0)}
            sub="persons"
            icon={<Users className="w-4 h-4" />}
            color="accent"
          />
          <KPICard
            label="This Week"
            value={statsLoading ? "—" : String(stats?.weekCount ?? 0)}
            sub="reservations"
            icon={<TrendingUp className="w-4 h-4" />}
            color="success"
          />
          <KPICard
            label="Week Covers"
            value={statsLoading ? "—" : String(stats?.weekCovers ?? 0)}
            sub="persons"
            icon={<Flame className="w-4 h-4" />}
            color="warning"
          />
        </div>

        {/* Week mini calendar */}
        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">Week Overview</h2>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7"
                onClick={() => setSelectedDate(format(subDays(new Date(selectedDate), 7), "yyyy-MM-dd"))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7"
                onClick={() => setSelectedDate(format(addDays(new Date(selectedDate), 7), "yyyy-MM-dd"))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map(day => {
              const isSelected = day === selectedDate;
              const isToday = day === format(new Date(), "yyyy-MM-dd");
              const cal = calendarData[day];
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(day)}
                  data-testid={`calendar-day-${day}`}
                  className={`rounded-xl p-2 text-center transition-colors cursor-pointer ${
                    isSelected ? "bg-primary text-primary-foreground" :
                    isToday ? "bg-primary/10 text-primary border border-primary/30" :
                    "hover:bg-muted"
                  }`}
                >
                  <p className="text-xs font-medium">{format(new Date(day), "EEE")}</p>
                  <p className="text-lg font-bold tabular">{format(new Date(day), "d")}</p>
                  {cal ? (
                    <p className={`text-xs tabular ${isSelected ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                      {cal.count} bkg
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground/40">—</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, or date…"
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-search"
          />
        </div>

        {/* Search results overlay */}
        {search.length > 1 && (
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-medium">{searchResults.length} result{searchResults.length !== 1 ? "s" : ""}</p>
            </div>
            {searchResults.length === 0 ? (
              <p className="p-6 text-center text-muted-foreground text-sm">No matching reservations</p>
            ) : (
              <div className="divide-y divide-border">
                {searchResults.slice(0, 20).map(r => (
                  <ReservationRow key={r.id} reservation={r} onStatusChange={(id, s) => statusMutation.mutate({ id, status: s })} onTableChange={(id, label) => tableMutation.mutate({ id, label })} waLink={getWALink(r)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Day view */}
        {!search && (
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="font-semibold">{format(new Date(selectedDate), "EEEE, d MMMM yyyy")}</h2>
                <p className="text-xs text-muted-foreground">
                  {dayRes.filter(r => r.status !== "cancelled").length} confirmed ·{" "}
                  {dayRes.filter(r => r.status !== "cancelled").reduce((s, r) => s + r.partySize, 0)} covers
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={exportCSV} data-testid="button-export">
                <Download className="w-3 h-3 mr-1" /> Export
              </Button>
            </div>

            {dayLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="skeleton h-16" />)}
              </div>
            ) : dayRes.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No reservations for this day</p>
                <p className="text-sm">Bookings will appear here once made</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {dayRes
                  .sort((a, b) => a.time.localeCompare(b.time))
                  .map(r => (
                    <ReservationRow key={r.id} reservation={r} onStatusChange={(id, s) => statusMutation.mutate({ id, status: s })} onTableChange={(id, label) => tableMutation.mutate({ id, label })} waLink={getWALink(r)} />
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Upcoming today (quick glance) */}
        {!search && stats?.upcomingToday && stats.upcomingToday.length > 0 && (
          <div className="bg-card rounded-2xl border border-border p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" /> Next Up Today
            </h3>
            <div className="space-y-2">
              {stats.upcomingToday.slice(0, 5).map(r => (
                <div key={r.id} className="flex items-center gap-3 text-sm">
                  <span className="font-bold tabular text-primary w-12">{r.time}</span>
                  <span className="font-medium flex-1">{r.name}</span>
                  <span className="text-muted-foreground">{r.partySize} pax</span>
                  {(r as any).tableLabel && <span className="text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5 font-medium">{(r as any).tableLabel}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <footer className="text-center text-xs text-muted-foreground py-4">
        <a href="https://www.perplexity.ai/computer" target="_blank" rel="noopener noreferrer" className="hover:underline">
          Created with Perplexity Computer
        </a>
      </footer>
    </div>
  );
}

// ─── Reservation Row ──────────────────────────────────────────────────────────
function ReservationRow({
  reservation: r,
  onStatusChange,
  onTableChange,
  waLink,
}: {
  reservation: Reservation;
  onStatusChange: (id: number, status: string) => void;
  onTableChange: (id: number, label: string) => void;
  waLink: string;
}) {
  const [tableInput, setTableInput] = useState(r.tableLabel ?? "");
  const [saving, setSaving] = useState(false);

  const saveTable = async () => {
    if (tableInput === (r.tableLabel ?? "")) return;
    setSaving(true);
    await onTableChange(r.id, tableInput);
    setSaving(false);
  };

  return (
    <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3" data-testid={`reservation-row-${r.id}`}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0 tabular">
          {r.time}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">{r.name}</span>
            <StatusBadge status={r.status} />
            {r.whatsappSent === 1 && (
              <span className="text-xs text-[#25D366] flex items-center gap-0.5">
                <MessageCircle className="w-3 h-3" /> Sent
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mt-0.5">
            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{r.partySize} pax</span>
            <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{r.phone}</span>
            {r.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{r.email}</span>}
          </div>
          {r.notes && <p className="text-xs text-muted-foreground mt-1 italic">{r.notes}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        {/* Table assignment input */}
        <div className="flex items-center gap-1" title="Assign table">
          <input
            type="text"
            value={tableInput}
            onChange={e => setTableInput(e.target.value.toUpperCase())}
            onBlur={saveTable}
            onKeyDown={e => e.key === "Enter" && saveTable()}
            placeholder="Table"
            maxLength={8}
            data-testid={`input-table-${r.id}`}
            className={`h-8 w-20 rounded-lg border text-xs font-medium text-center px-2 bg-background transition-colors outline-none
              ${ tableInput ? "border-primary/50 text-primary" : "border-border text-muted-foreground" }
              focus:border-primary focus:ring-1 focus:ring-primary/30
              ${ saving ? "opacity-50" : "" }
            `}
          />
        </div>
        <Select
          value={r.status}
          onValueChange={v => onStatusChange(r.id, v)}
        >
          <SelectTrigger className="h-8 text-xs w-32" data-testid={`select-status-${r.id}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="no_show">No Show</SelectItem>
          </SelectContent>
        </Select>
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="h-8 w-8 flex items-center justify-center rounded-lg bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] transition-colors"
          data-testid={`link-wa-${r.id}`}
          title="Send WhatsApp"
        >
          <MessageCircle className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, icon, color }: {
  label: string; value: string; sub: string; icon: React.ReactNode; color: string;
}) {
  const colorMap: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    accent: "text-orange-500 bg-orange-500/10",
    success: "text-emerald-600 bg-emerald-500/10",
    warning: "text-amber-600 bg-amber-500/10",
  };
  return (
    <div className="bg-card rounded-2xl border border-border p-4" data-testid={`kpi-${label.toLowerCase().replace(/ /g, "-")}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${colorMap[color]}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold tabular">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  if (status === "confirmed") return <span className="status-confirmed text-xs px-2 py-0.5 rounded-full font-medium">Confirmed</span>;
  if (status === "cancelled") return <span className="status-cancelled text-xs px-2 py-0.5 rounded-full font-medium">Cancelled</span>;
  return <span className="status-no_show text-xs px-2 py-0.5 rounded-full font-medium">No Show</span>;
}

function GogiLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-label="The Gogi logo">
      <rect width="32" height="32" rx="8" fill="#c0440f" />
      <path d="M10 22C10 22 11 14 16 12C21 10 22 14 20 16C18 18 14 17 16 14" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M14 22C14 22 15 17 18 16" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.7"/>
      <circle cx="22" cy="22" r="2.5" fill="white" opacity="0.9"/>
      <circle cx="18" cy="23" r="1.8" fill="white" opacity="0.7"/>
      <circle cx="14" cy="23" r="1.5" fill="white" opacity="0.6"/>
    </svg>
  );
}
