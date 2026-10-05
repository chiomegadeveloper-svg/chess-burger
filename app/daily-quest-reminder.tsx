"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { Dialog, DialogClose, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import "./daily-quest-reminder.css";

export default function DailyQuestReminder({ open, onDismiss }: { open: boolean; onDismiss: () => void }) {
  return (
    <Dialog open={open} onOpenChange={nextOpen => { if (!nextOpen) onDismiss(); }}>
      <DialogPortal>
      <DialogOverlay className="daily-quest-reminder-overlay" />
      <DialogPrimitive.Content data-slot="dialog-content" className="daily-quest-reminder">
        <span className="daily-quest-reminder-label">NEW IN CHESS BURGER</span>
        <img src="/daily-quest-reward-chest.webp" width={180} height={180} alt="" />
        <DialogTitle>Daily Quest is here!</DialogTitle>
        <DialogDescription>
          New chess missions are waiting. Open Daily Quest in Home to track your progress and earn rewards.
        </DialogDescription>
        <DialogClose className="daily-quest-reminder-close">Close</DialogClose>
      </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
