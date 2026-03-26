import { Resend } from "resend";
import dns from "dns";
// Force IPv4 for all DNS lookups
dns.setDefaultResultOrder("ipv4first");

const resend = new Resend(process.env.RESEND_API_KEY || "re_5pyzUKq2_Cqamy5qEsfo8eVfS5jaytLqs");

// Wrap any email send with a 5-second timeout so failures never block the server
async function withTimeout<T>(promise: Promise<T>, ms = 5000): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Email timeout after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

// Resend free tier: can only send TO your own account email without domain verification
// From address must use onboarding@resend.dev until a domain is verified
const FROM = "The Gogi Reservations <onboarding@resend.dev>";
const OWNER_EMAIL = process.env.OWNER_EMAIL || "gogi.reservations@gmail.com";

function friendlyDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00+08:00");
  return d.toLocaleDateString("en-SG", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "Asia/Singapore",
  });
}

// ─── Owner alert email ────────────────────────────────────────────────────────
export async function sendOwnerAlert(reservation: any, coversBooked: number): Promise<void> {
  const totalAfter = coversBooked + reservation.partySize;
  const fillPct = Math.round((totalAfter / 75) * 100);
  const barColor = fillPct >= 90 ? "#c0440f" : fillPct >= 75 ? "#d97706" : "#437a22";

  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e8e4df;">
      <div style="background:#c0440f;padding:20px 32px;">
        <div style="font-size:16px;font-weight:700;color:#fff;">🔔 New Reservation — Booking #${reservation.id}</div>
      </div>
      <div style="padding:28px 32px;">
        <div style="background:#f7f5f2;border-radius:10px;padding:20px;margin-bottom:20px;">
          <div style="font-size:12px;font-weight:700;color:#9a9490;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">Guest Details</div>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:6px 0;color:#9a9490;font-size:13px;width:35%;">Name</td><td style="padding:6px 0;color:#1e1a16;font-size:13px;font-weight:600;">${reservation.name}</td></tr>
            <tr style="border-top:1px solid #ece9e5;"><td style="padding:6px 0;color:#9a9490;font-size:13px;">Phone</td><td style="padding:6px 0;color:#1e1a16;font-size:13px;">+65 ${reservation.phone}</td></tr>
            ${reservation.email ? `<tr style="border-top:1px solid #ece9e5;"><td style="padding:6px 0;color:#9a9490;font-size:13px;">Email</td><td style="padding:6px 0;color:#1e1a16;font-size:13px;">${reservation.email}</td></tr>` : ""}
            <tr style="border-top:1px solid #ece9e5;"><td style="padding:6px 0;color:#9a9490;font-size:13px;">Date</td><td style="padding:6px 0;color:#1e1a16;font-size:13px;font-weight:600;">${friendlyDate(reservation.date)}</td></tr>
            <tr style="border-top:1px solid #ece9e5;"><td style="padding:6px 0;color:#9a9490;font-size:13px;">Time</td><td style="padding:6px 0;color:#1e1a16;font-size:13px;font-weight:600;">${reservation.time}</td></tr>
            <tr style="border-top:1px solid #ece9e5;"><td style="padding:6px 0;color:#9a9490;font-size:13px;">Party size</td><td style="padding:6px 0;color:#1e1a16;font-size:13px;font-weight:600;">${reservation.partySize} pax</td></tr>
            ${reservation.notes ? `<tr style="border-top:1px solid #ece9e5;"><td style="padding:6px 0;color:#9a9490;font-size:13px;">Notes</td><td style="padding:6px 0;color:#c0440f;font-size:13px;font-weight:600;">${reservation.notes}</td></tr>` : ""}
          </table>
        </div>
        <div style="background:#f7f5f2;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
          <div style="font-size:12px;font-weight:700;color:#9a9490;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Slot Capacity (90-min window)</div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
            <span style="font-size:13px;color:#1e1a16;font-weight:600;">${totalAfter} / 75 covers</span>
            <span style="font-size:13px;color:${barColor};font-weight:600;">${fillPct}% full</span>
          </div>
          <div style="background:#ece9e5;border-radius:4px;height:8px;overflow:hidden;">
            <div style="height:100%;width:${Math.min(fillPct, 100)}%;background:${barColor};border-radius:4px;"></div>
          </div>
        </div>
        <div style="text-align:center;">
          <a href="https://www.perplexity.ai/computer/a/the-gogi-korean-bbq-reservatio-1MVmAMHmTwqUxVFEHuYhpg/#/admin"
             style="display:inline-block;background:#1e1a16;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:13px;font-weight:600;">
            Open Staff Dashboard →
          </a>
        </div>
      </div>
    </div>
  `;

  const result = await withTimeout(resend.emails.send({
    from: FROM,
    to: [OWNER_EMAIL],
    subject: `🔔 New Booking #${reservation.id} — ${reservation.name} · ${reservation.partySize} pax · ${reservation.date} ${reservation.time}`,
    html,
  }));

  if (result.error) throw new Error(result.error.message);
}

// ─── Customer confirmation email ─────────────────────────────────────────────
export async function sendCustomerConfirmation(reservation: any): Promise<void> {
  if (!reservation.email) return;

  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e8e4df;">
      <div style="background:#1e1a16;padding:28px 32px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:#fff;">🔥 The Gogi</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px;">@ Alexandra Central</div>
      </div>
      <div style="padding:32px;">
        <h2 style="margin:0 0 8px;font-size:20px;color:#1e1a16;">Booking Confirmed!</h2>
        <p style="margin:0 0 24px;color:#7a7570;font-size:14px;">Dear ${reservation.name}, your reservation has been confirmed. We look forward to seeing you!</p>
        <div style="background:#f7f5f2;border-radius:10px;padding:20px;margin-bottom:24px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#9a9490;font-size:13px;width:40%;">📅 Date</td><td style="padding:8px 0;color:#1e1a16;font-size:13px;font-weight:600;">${friendlyDate(reservation.date)}</td></tr>
            <tr style="border-top:1px solid #ece9e5;"><td style="padding:8px 0;color:#9a9490;font-size:13px;">⏰ Time</td><td style="padding:8px 0;color:#1e1a16;font-size:13px;font-weight:600;">${reservation.time}</td></tr>
            <tr style="border-top:1px solid #ece9e5;"><td style="padding:8px 0;color:#9a9490;font-size:13px;">👥 Party size</td><td style="padding:8px 0;color:#1e1a16;font-size:13px;font-weight:600;">${reservation.partySize} ${reservation.partySize === 1 ? "person" : "persons"}</td></tr>
            ${reservation.notes ? `<tr style="border-top:1px solid #ece9e5;"><td style="padding:8px 0;color:#9a9490;font-size:13px;">📝 Notes</td><td style="padding:8px 0;color:#1e1a16;font-size:13px;">${reservation.notes}</td></tr>` : ""}
          </table>
        </div>
        <div style="background:#fff8f5;border:1px solid #f0e8e2;border-radius:10px;padding:16px;margin-bottom:24px;">
          <div style="font-size:13px;color:#1e1a16;font-weight:600;margin-bottom:4px;">📍 Find us here</div>
          <div style="font-size:13px;color:#7a7570;">321 Alexandra Rd, #02-01 Alexandra Central<br>Singapore 159971</div>
          <div style="font-size:13px;color:#7a7570;margin-top:6px;">📞 +65 8181 7221</div>
        </div>
        <p style="font-size:12px;color:#b0ada8;margin:0;">Please arrive 5 minutes early. To cancel or modify your booking, reply to this email or call us at +65 8181 7221.</p>
      </div>
      <div style="background:#f7f5f2;padding:16px 32px;text-align:center;border-top:1px solid #ece9e5;">
        <p style="margin:0;font-size:11px;color:#b0ada8;">© The Gogi @ Alexandra Central</p>
      </div>
    </div>
  `;

  const result = await withTimeout(resend.emails.send({
    from: FROM,
    to: [reservation.email],
    subject: `✅ Booking Confirmed — ${friendlyDate(reservation.date)} at ${reservation.time}`,
    html,
  }));

  if (result.error) throw new Error(result.error.message);
}
