"use client";
import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Dialog, DialogClose, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import "./daily-quest-reminder.css";

type Schedule = { id: string; title: string; date: string; slot: number; starts_at: string; ends_at: string };
export default function ArenaReminder({ open, onDismiss, onOpen }: { open: boolean; onDismiss: () => void; onOpen: () => void }) {
  const [schedules, setSchedules] = useState<Schedule[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setFailed(false);
    void fetch("/api/grand-arena?action=window", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error("Schedule unavailable");
      const data = await response.json() as { upcoming: Schedule[] };
      setSchedules(data.upcoming.slice(0, 2));
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [open]);
  return <Dialog open={open} onOpenChange={value => { if (!value) onDismiss(); }}><DialogPortal>
    <DialogOverlay className="daily-quest-reminder-overlay" />
    <DialogPrimitive.Content data-slot="dialog-content" className="daily-quest-reminder">
      <span className="daily-quest-reminder-label">UPCOMING ARENA CHESS BATTLE</span>
      <img src="/play-selection/grand-arena.webp" width={180} height={180} alt="Grand Arena chess battle castle" />
      <DialogTitle>Your next Arena battle awaits!</DialogTitle>
      <DialogDescription>Bring your Arena ticket, reserve your place, and challenge other chess players in a battle scheduled by the owner.</DialogDescription>
      <div aria-live="polite">{failed ? <p>Open Arena to view the latest schedule.</p> : schedules === null ? <p>Loading upcoming sessions…</p> : schedules.length ? schedules.map(slot => <p key={slot.id} style={{ fontSize: 13, margin: "8px 0" }}><strong>{slot.title}</strong><br/>{new Date(slot.starts_at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })} – {new Date(slot.ends_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })} · PH time</p>) : <p>No upcoming sessions scheduled.</p>}</div>
      <button type="button" className="daily-quest-reminder-open" onClick={onOpen}>Register now!</button>
      <DialogClose className="daily-quest-reminder-close">Close</DialogClose>
    </DialogPrimitive.Content>
  </DialogPortal></Dialog>;
}
