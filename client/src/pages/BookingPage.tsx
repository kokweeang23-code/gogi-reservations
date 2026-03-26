import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, API_BASE } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Calendar, Clock, Users, Phone, Mail, CheckCircle2,
  ChevronRight, ChevronLeft, Flame, MapPin
} from "lucide-react";
import { useLocation } from "wouter";
import {
  format, addDays, startOfMonth, endOfMonth, startOfWeek,
  endOfWeek, isBefore, isAfter, isSameDay, addMonths, subMonths
} from "date-fns";

// ─── Schema ───────────────────────────────────────────────────────────────────
const bookingSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().min(8, "Enter a valid Singapore phone number"),
  email: z.string().email("Enter a valid email").or(z.literal("")).optional(),
  date: z.string().min(1, "Select a date"),
  time: z.string().min(1, "Select a time"),
  partySize: z.number().int().min(1).max(15),
  notes: z.string().optional(),
});
type BookingForm = z.infer<typeof bookingSchema>;

// ─── Calendar Picker ──────────────────────────────────────────────────────────
function CalendarPicker({
  value,
  onChange,
  hasError,
}: {
  value: string;
  onChange: (date: string) => void;
  hasError?: boolean;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = addDays(today, 30);

  const [viewMonth, setViewMonth] = useState<Date>(() => new Date(today));

  // Build calendar grid for current view month
  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday start
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days: Date[] = [];
  let cursor = gridStart;
  while (!isAfter(cursor, gridEnd)) {
    days.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }

  const selectedDate = value ? new Date(value + "T00:00:00") : null;

  const isSelectable = (d: Date) => {
    const norm = new Date(d);
    norm.setHours(0, 0, 0, 0);
    return !isBefore(norm, today) && !isAfter(norm, maxDate);
  };

  const isInMonth = (d: Date) =>
    d.getMonth() === viewMonth.getMonth() && d.getFullYear() === viewMonth.getFullYear();

  // Can navigate prev/next month?
  const canPrev = isAfter(startOfMonth(viewMonth), today);
  const canNext = isBefore(startOfMonth(addMonths(viewMonth, 1)), maxDate);

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className={`rounded-xl border ${hasError ? "border-destructive" : "border-border"} overflow-hidden bg-background`}>
      {/* Month header */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b border-border">
        <button
          type="button"
          onClick={() => setViewMonth(subMonths(viewMonth, 1))}
          disabled={!canPrev}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-semibold text-sm">
          {format(viewMonth, "MMMM yyyy")}
        </span>
        <button
          type="button"
          onClick={() => setViewMonth(addMonths(viewMonth, 1))}
          disabled={!canNext}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b border-border">
        {weekDays.map(d => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Date grid */}
      <div className="grid grid-cols-7 p-2 gap-1">
        {days.map((day, i) => {
          const isToday = isSameDay(day, today);
          const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
          const selectable = isSelectable(day);
          const inMonth = isInMonth(day);
          const dateStr = format(day, "yyyy-MM-dd");

          return (
            <button
              key={i}
              type="button"
              disabled={!selectable}
              onClick={() => selectable && onChange(dateStr)}
              data-testid={`cal-day-${dateStr}`}
              aria-label={format(day, "d MMMM yyyy")}
              aria-pressed={isSelected}
              className={`
                relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm font-medium transition-all
                ${!inMonth ? "opacity-0 pointer-events-none" : ""}
                ${isSelected
                  ? "bg-primary text-primary-foreground shadow-md scale-105"
                  : selectable && inMonth
                    ? "hover:bg-primary/10 hover:text-primary cursor-pointer"
                    : "text-muted-foreground/40 cursor-not-allowed"
                }
                ${isToday && !isSelected ? "ring-1 ring-primary text-primary font-bold" : ""}
              `}
            >
              <span>{format(day, "d")}</span>
              {isToday && (
                <span className={`absolute bottom-1 w-1 h-1 rounded-full ${isSelected ? "bg-primary-foreground/60" : "bg-primary"}`} />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected date display */}
      {selectedDate && (
        <div className="px-4 py-2.5 bg-primary/5 border-t border-border flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-primary" />
          <span className="text-sm font-medium text-primary">
            {isSameDay(selectedDate, today)
              ? "Today — " + format(selectedDate, "EEEE, d MMMM yyyy")
              : isSameDay(selectedDate, addDays(today, 1))
                ? "Tomorrow — " + format(selectedDate, "EEEE, d MMMM yyyy")
                : format(selectedDate, "EEEE, d MMMM yyyy")}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function BookingPage() {
  const { toast } = useToast();
  const [step, setStep] = useState<"form" | "confirm" | "success">("form");
  const [confirmData, setConfirmData] = useState<{ reservation: any; whatsappUrl: string; confirmationMessage: string } | null>(null);

  const form = useForm<BookingForm>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      date: "",
      time: "",
      partySize: 2,
      notes: "",
    },
  });

  // Fetch time slots
  const { data: slotsData } = useQuery<{ slots: string[] }>({
    queryKey: ["/api/time-slots"],
  });

  // Fetch slot statuses whenever date or party size changes
  const watchedDate2 = form.watch("date");
  const watchedParty = form.watch("partySize");
  const { data: slotStatuses } = useQuery<Record<string, { status: string; spotsLeft: number }>>(
    {
      queryKey: [`${API_BASE}/api/slot-status`, watchedDate2, watchedParty],
      queryFn: () =>
        fetch(`${API_BASE}/api/slot-status?date=${watchedDate2}&partySize=${watchedParty}`).then(r => r.json()),
      enabled: !!watchedDate2,
    }
  );

  // Submit reservation
  const bookMutation = useMutation({
    mutationFn: (data: BookingForm) =>
      apiRequest("POST", "/api/reservations", data).then(r => r.json()),
    onSuccess: (data) => {
      setConfirmData(data);
      setStep("success");
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "Slot fully booked",
        description: "This time slot has reached capacity. Please choose another time.",
      });
    },
  });

  const onSubmit = (_data: BookingForm) => {
    setStep("confirm");
  };

  // Scroll to first error when validation fails
  const onInvalid = () => {
    const firstError = document.querySelector('[class*="border-destructive"], [data-error="true"]');
    if (firstError) {
      firstError.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const slots = slotsData?.slots ?? [];
  const lunchSlots = slots.filter(s => {
    const h = parseInt(s.split(":")[0]);
    return h >= 11 && h < 15;
  });
  const dinnerSlots = slots.filter(s => {
    const h = parseInt(s.split(":")[0]);
    return h >= 17;
  });

  // ─── Confirm step ─────────────────────────────────────────────────────────
  if (step === "confirm") {
    const v = form.getValues();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(v.date + "T00:00:00");
    const isToday = isSameDay(selectedDate, today);
    const isTomorrow = isSameDay(selectedDate, addDays(today, 1));
    const friendlyDate = isToday
      ? "Today — " + format(selectedDate, "EEEE, d MMM yyyy")
      : isTomorrow
        ? "Tomorrow — " + format(selectedDate, "EEEE, d MMM yyyy")
        : format(selectedDate, "EEEE, d MMM yyyy");

    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md">
            <div className="bg-card rounded-2xl shadow-lg border border-border p-8">
              <h2 className="text-xl font-bold mb-2">Confirm your booking</h2>
              <p className="text-muted-foreground text-sm mb-6">Please review your details before confirming.</p>
              <div className="space-y-3 mb-8">
                <Row icon={<Users className="w-4 h-4" />} label="Name" value={v.name} />
                <Row icon={<Phone className="w-4 h-4" />} label="Phone" value={v.phone} />
                {v.email && <Row icon={<Mail className="w-4 h-4" />} label="Email" value={v.email} />}
                <Row icon={<Calendar className="w-4 h-4" />} label="Date" value={friendlyDate} />
                <Row icon={<Clock className="w-4 h-4" />} label="Time" value={v.time} />
                <Row icon={<Users className="w-4 h-4" />} label="Party size" value={`${v.partySize} person${v.partySize > 1 ? "s" : ""}`} />
                {v.notes && <Row icon={<Flame className="w-4 h-4" />} label="Notes" value={v.notes} />}
              </div>
              <p className="text-xs text-muted-foreground mb-6">
                A WhatsApp confirmation will be generated for you to send to your number.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep("form")}>Edit</Button>
                <Button
                  className="flex-1 bg-primary hover:bg-primary/90"
                  onClick={() => bookMutation.mutate(form.getValues())}
                  disabled={bookMutation.isPending}
                  data-testid="button-confirm-booking"
                >
                  {bookMutation.isPending ? "Confirming…" : "Confirm Booking"}
                </Button>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ─── Success step (PENDING — awaiting owner confirmation) ──────────────────
  if (step === "success" && confirmData) {
    const { reservation } = confirmData as any;
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md text-center">
            <div className="bg-card rounded-2xl shadow-lg border border-border p-8">
              {/* Pending icon — clock, not checkmark */}
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-xl font-bold mb-2">Request Received!</h2>
              <p className="text-muted-foreground text-sm mb-6">
                Booking for <strong>{reservation.name}</strong>
              </p>

              {/* Booking summary */}
              <div className="bg-muted rounded-xl p-4 text-sm text-left space-y-2 mb-6">
                <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium">{format(new Date(reservation.date + "T00:00:00"), "EEE, d MMM yyyy")}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span className="font-medium">{reservation.time}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Party</span><span className="font-medium">{reservation.partySize} {reservation.partySize === 1 ? "person" : "persons"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="font-medium text-amber-600 dark:text-amber-400">Pending confirmation</span></div>
              </div>

              {/* What happens next */}
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-6 text-left">
                <p className="text-amber-700 dark:text-amber-400 text-sm font-semibold mb-2">What happens next?</p>
                <ol className="space-y-1.5 text-amber-700/80 dark:text-amber-400/80 text-xs">
                  <li className="flex items-start gap-2"><span className="font-bold shrink-0">1.</span>Our team reviews your request</li>
                  <li className="flex items-start gap-2"><span className="font-bold shrink-0">2.</span>You'll receive a confirmation within 24 hours</li>
                  <li className="flex items-start gap-2"><span className="font-bold shrink-0">3.</span>Check your email and/or WhatsApp for confirmation</li>
                </ol>
              </div>

              {/* Contact */}
              <p className="text-xs text-muted-foreground mb-6">
                Questions? Call us at <strong>+65 8181 7221</strong> or WhatsApp us directly.
              </p>

              <Button
                className="w-full bg-primary hover:bg-primary/90"
                onClick={() => { setStep("form"); form.reset(); setConfirmData(null); }}
              >
                Make Another Booking
              </Button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ─── Booking form ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      {/* Hero */}
      <section className="relative bg-[#1e1a16] text-white overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
        <div className="relative max-w-2xl mx-auto px-6 py-12 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Flame className="w-5 h-5 text-orange-400" />
            <span className="text-orange-300 text-sm font-medium uppercase tracking-widest">Korean BBQ</span>
            <Flame className="w-5 h-5 text-orange-400" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Reserve Your Table</h1>
          <p className="text-white/70 text-sm">
            The Gogi @ Alexandra Central · #02-01, 321 Alexandra Rd · ☎ +65 8181 7221
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
            <Badge variant="outline" className="text-white/80 border-white/20 bg-white/5 text-xs">
              <Clock className="w-3 h-3 mr-1" />Lunch 11:00–15:00
            </Badge>
            <Badge variant="outline" className="text-white/80 border-white/20 bg-white/5 text-xs">
              <Clock className="w-3 h-3 mr-1" />Dinner 17:00–23:00
            </Badge>
            <Badge variant="outline" className="text-white/80 border-white/20 bg-white/5 text-xs">
              <Users className="w-3 h-3 mr-1" />Up to 15 pax
            </Badge>
          </div>
        </div>
      </section>

      <main className="flex-1 px-4 py-10">
        <div className="max-w-lg mx-auto">
          <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-6">

            {/* ── Date & Time card ── */}
            <div
              className={`bg-card rounded-2xl border p-6 space-y-5 transition-colors ${
                form.formState.errors.date || form.formState.errors.time
                  ? "border-destructive ring-1 ring-destructive/30"
                  : "border-border"
              }`}
              data-error={!!(form.formState.errors.date || form.formState.errors.time)}
            >
              <h2 className="font-semibold flex items-center gap-2 text-base">
                <Calendar className="w-4 h-4 text-primary" /> When are you coming?
              </h2>

              {/* Calendar */}
              <div className="space-y-1.5">
                <Label>Date</Label>
                <CalendarPicker
                  value={form.watch("date")}
                  onChange={(v) => {
                    form.setValue("date", v, { shouldValidate: true });
                    form.setValue("time", "");
                  }}
                  hasError={!!form.formState.errors.date}
                />
                {form.formState.errors.date && (
                  <p className="text-destructive text-xs mt-1">{form.formState.errors.date.message}</p>
                )}
              </div>

              {/* Time slots */}
              <div className="space-y-2">
                <Label>Time</Label>
                {watchedDate2 && !slotStatuses && (
                  <p className="text-xs text-muted-foreground">Checking availability…</p>
                )}
                <div className="space-y-3">
                  {lunchSlots.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wide font-medium">Lunch</p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {lunchSlots.map(slot => {
                          const st = slotStatuses?.[slot];
                          const isFull = st?.status === "full";
                          const isFilling = st?.status === "filling";
                          const isSelected = form.watch("time") === slot;
                          return (
                            <button
                              key={slot}
                              type="button"
                              disabled={isFull}
                              data-testid={`slot-${slot}`}
                              className={`relative text-sm py-2 px-1 rounded-lg border transition-colors font-medium ${
                                isSelected
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : isFull
                                    ? "bg-muted border-border text-muted-foreground/40 cursor-not-allowed line-through"
                                    : isFilling
                                      ? "bg-amber-50 border-amber-300 text-amber-700 hover:border-amber-500 dark:bg-amber-900/20 dark:border-amber-600 dark:text-amber-400"
                                      : "bg-background border-border hover:border-primary hover:text-primary"
                              }`}
                              onClick={() => !isFull && form.setValue("time", slot, { shouldValidate: true })}
                            >
                              {slot}
                              {isFilling && !isSelected && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400" title="Filling fast" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {dinnerSlots.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wide font-medium">Dinner</p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {dinnerSlots.map(slot => {
                          const st = slotStatuses?.[slot];
                          const isFull = st?.status === "full";
                          const isFilling = st?.status === "filling";
                          const isSelected = form.watch("time") === slot;
                          return (
                            <button
                              key={slot}
                              type="button"
                              disabled={isFull}
                              data-testid={`slot-${slot}`}
                              className={`relative text-sm py-2 px-1 rounded-lg border transition-colors font-medium ${
                                isSelected
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : isFull
                                    ? "bg-muted border-border text-muted-foreground/40 cursor-not-allowed line-through"
                                    : isFilling
                                      ? "bg-amber-50 border-amber-300 text-amber-700 hover:border-amber-500 dark:bg-amber-900/20 dark:border-amber-600 dark:text-amber-400"
                                      : "bg-background border-border hover:border-primary hover:text-primary"
                              }`}
                              onClick={() => !isFull && form.setValue("time", slot, { shouldValidate: true })}
                            >
                              {slot}
                              {isFilling && !isSelected && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400" title="Filling fast" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                {/* Legend */}
                {slotStatuses && (
                  <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Filling fast</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground/30 inline-block" /> Full</span>
                  </div>
                )}
                {form.formState.errors.time && (
                  <p className="text-destructive text-xs">{form.formState.errors.time.message}</p>
                )}
              </div>

              {/* Party size */}
              <div className="space-y-1.5">
                <Label htmlFor="partySize">Party size</Label>
                <Select
                  onValueChange={(v) => form.setValue("partySize", parseInt(v), { shouldValidate: true })}
                  value={String(form.watch("partySize"))}
                >
                  <SelectTrigger id="partySize" data-testid="select-party-size">
                    <SelectValue placeholder="Select party size" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 15 }, (_, i) => i + 1).map(n => (
                      <SelectItem key={n} value={String(n)}>{n} {n === 1 ? "person" : "persons"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── Contact card ── */}
            <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
              <h2 className="font-semibold flex items-center gap-2 text-base">
                <Phone className="w-4 h-4 text-primary" /> Your details
              </h2>
              <div className="space-y-1">
                <Label htmlFor="name">Full name *</Label>
                <Input
                  id="name"
                  data-testid="input-name"
                  placeholder="e.g. Kim Min-jun"
                  {...form.register("name")}
                  className={form.formState.errors.name ? "border-destructive" : ""}
                />
                {form.formState.errors.name && <p className="text-destructive text-xs">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone">WhatsApp number *</Label>
                <div className={`flex rounded-md border overflow-hidden ${form.formState.errors.phone ? "border-destructive" : "border-input"} focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0`}>
                  <span className="flex items-center px-3 bg-muted text-muted-foreground text-sm font-medium border-r border-input select-none shrink-0">
                    +65
                  </span>
                  <Input
                    id="phone"
                    data-testid="input-phone"
                    placeholder="9123 4567"
                    inputMode="numeric"
                    {...form.register("phone")}
                    className="border-0 rounded-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
                <p className="text-xs text-muted-foreground">We'll send your booking confirmation here</p>
                {form.formState.errors.phone && <p className="text-destructive text-xs">{form.formState.errors.phone.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="email">Email (optional)</Label>
                <Input
                  id="email"
                  data-testid="input-email"
                  type="email"
                  placeholder="you@email.com"
                  {...form.register("email")}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="notes">Special requests (optional)</Label>
                <Textarea
                  id="notes"
                  data-testid="input-notes"
                  placeholder="e.g. birthday celebration, dietary restrictions, high chair needed…"
                  rows={3}
                  {...form.register("notes")}
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-6 text-base font-semibold rounded-xl"
              data-testid="button-proceed"
            >
              Review Booking <ChevronRight className="w-4 h-4 ml-1" />
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              By booking, you agree to our reservation policy. We hold tables for 15 minutes.
            </p>
          </form>
        </div>
      </main>
      <Footer />
    </div>
  );
}

// ─── Shared sub-components ───────────────────────────────────────────────────
function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border last:border-0">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div className="flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium text-sm">{value}</p>
      </div>
    </div>
  );
}

function Header() {
  const [, navigate] = useLocation();
  return (
    <header className="bg-[#1e1a16] px-6 py-4 flex items-center justify-between border-b border-white/10">
      <div className="flex items-center gap-3">
        <GogiLogo />
        <div>
          <p className="text-white font-bold text-base leading-none">The Gogi</p>
          <p className="text-white/50 text-xs">@ Alexandra Central</p>
        </div>
      </div>
      <button
        onClick={() => navigate("/admin")}
        className="text-white/40 hover:text-white/70 text-xs transition-colors cursor-pointer bg-transparent border-none"
        data-testid="link-staff"
      >
        Staff
      </button>
    </header>
  );
}

function Footer() {
  return (
    <footer className="bg-[#1e1a16] text-white/40 text-xs px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        <MapPin className="w-3 h-3" />
        321 Alexandra Rd, #02-01, Singapore 159971
      </div>
      <a href="https://www.perplexity.ai/computer" target="_blank" rel="noopener noreferrer" className="hover:text-white/60 transition-colors">
        Created with Perplexity Computer
      </a>
    </footer>
  );
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
