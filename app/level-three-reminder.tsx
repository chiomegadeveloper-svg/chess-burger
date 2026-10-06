"use client";

import { useState } from "react";
import { Castle, Gift, Swords, Heart } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Dialog, DialogClose, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import "./daily-quest-reminder.css";
import "./level-three-reminder.css";

export default function LevelThreeReminder({ userId, open, onDonate }: { userId: string; open: boolean; onDonate: () => void }) {
  const storageKey = `cb-level-three-reminder:v1:${userId}`;
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(storageKey) === "dismissed"; }
    catch { return false; }
  });
  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(storageKey, "dismissed"); } catch { /* Dismissal still works for this launch. */ }
  };

  return (
    <Dialog open={open && !dismissed} onOpenChange={nextOpen => { if (!nextOpen) dismiss(); }}>
      <DialogPortal>
        <DialogOverlay className="daily-quest-reminder-overlay" />
        <DialogPrimitive.Content data-slot="dialog-content" className="daily-quest-reminder level-three-reminder">
          <span className="daily-quest-reminder-label">YOUR NEXT CHAPTER</span>
          <img src="/levels/level-02.png" width={100} height={100} alt="Level 3 emblem" />
          <DialogTitle>Level 3 opens more ways to play!</DialogTitle>
          <DialogDescription>Explore the features available from Level 3.</DialogDescription>
          <ul className="level-three-features">
            <li><Castle aria-hidden="true" /><div><strong>Join or create a Guild</strong><p>Represent your province, team up with other players, and earn shared Guild Treasure.</p></div></li>
            <li><Gift aria-hidden="true" /><div><strong>You can now gift CBG</strong><p>Send CBG to other players from your Bag. Hold at least 188 CBG to activate gifting.</p></div></li>
            <li><Swords aria-hidden="true" /><div><strong>Play with CBG wagers</strong><p>Challenge other players to a CBG wager match. Available to players age 14 and above.</p></div></li>
          </ul>
          <section className="level-three-support" aria-labelledby="level-three-support-title">
            <h3 id="level-three-support-title"><Heart size={18} aria-hidden="true" /> Help Chess Burger grow</h3>
            <p>If you enjoy Chess Burger, please consider donating. Your support helps current and future development, giving coaches, students, and chess players a better place to practice, play, and learn.</p>
            <button type="button" className="daily-quest-reminder-open" onClick={() => { dismiss(); onDonate(); }}>Support Chess Burger</button>
          </section>
          <DialogClose className="daily-quest-reminder-close">Close</DialogClose>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
