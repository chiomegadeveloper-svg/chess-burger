"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { Dialog, DialogClose, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import "./daily-quest-reminder.css";

export default function DailyQuestReminder({ open, kind, onDismiss, onOpen }: { open: boolean; kind: "quest" | "rewards"; onDismiss: () => void; onOpen: () => void }) {
  const rewards = kind === "rewards";
  return (
    <Dialog open={open} onOpenChange={nextOpen => { if (!nextOpen) onDismiss(); }}>
      <DialogPortal>
      <DialogOverlay className="daily-quest-reminder-overlay" />
      <DialogPrimitive.Content data-slot="dialog-content" className="daily-quest-reminder" onClick={onOpen}>
        <span className="daily-quest-reminder-label">{rewards ? "DAILY LOGIN REWARDS" : "NEW IN CHESS BURGER"}</span>
        <img src={rewards ? "/daily-rewards/day-7.webp" : "/daily-quest-reward-chest.webp"} width={180} height={180} alt="" />
        <DialogTitle>{rewards ? "Remember your Daily Rewards!" : "Daily Quest is here!"}</DialogTitle>
        <DialogDescription>
          {rewards ? "Open Daily Rewards to check your login streak and claim your available reward." : "New chess missions are waiting. Tap this reminder to open Daily Quest and track your progress."}
        </DialogDescription>
        <button type="button" className="daily-quest-reminder-open">{rewards ? "Open Daily Rewards" : "Open Daily Quest"}</button>
        <DialogClose className="daily-quest-reminder-close" onClick={event => event.stopPropagation()}>Close</DialogClose>
      </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
