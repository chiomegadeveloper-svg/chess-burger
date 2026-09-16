"use client";
import { useEffect, useMemo, useState } from "react";
import { Download, Share, X } from "lucide-react";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISS_KEY = "cb-install-prompt-dismissed";
const DISMISS_DAYS = 7;

function isStandalone() {
  if (typeof window === "undefined") return false;
  const iosStandalone = Boolean(
    (navigator as Navigator & { standalone?: boolean }).standalone,
  );
  return window.matchMedia("(display-mode: standalone)").matches || iosStandalone;
}

export default function InstallPrompt({ active }: { active: boolean }) {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const isIos = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      /iphone|ipad|ipod/i.test(navigator.userAgent),
    [],
  );

  useEffect(() => {
    setInstalled(isStandalone());
    const capture = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    const complete = () => {
      setInstalled(true);
      setVisible(false);
      localStorage.removeItem(DISMISS_KEY);
    };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", complete);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", complete);
    };
  }, []);

  useEffect(() => {
    if (!active || installed || isStandalone()) {
      setVisible(false);
      return;
    }
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_DAYS * 86400000)
      return;
    const timer = window.setTimeout(() => setVisible(true), 450);
    return () => window.clearTimeout(timer);
  }, [active, installed]);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  }

  async function install() {
    if (!installEvent) return;
    setBusy(true);
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === "accepted") {
        setVisible(false);
        localStorage.removeItem(DISMISS_KEY);
      }
      setInstallEvent(null);
    } finally {
      setBusy(false);
    }
  }

  if (!visible || installed) return null;
  return (
    <div className="install-prompt-backdrop" role="presentation">
      <section
        className="install-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
      >
        <button className="install-close" aria-label="Close" onClick={dismiss}>
          <X />
        </button>
        <img src="/cburger_logo.png" alt="" />
        <span>CHESS BURGER PWA</span>
        <h2 id="install-title">Install Chess Burger</h2>
        <p>
          Add the app to your device for faster access and a full-screen board.
        </p>
        {installEvent ? (
          <button
            className="install-primary"
            disabled={busy}
            onClick={() => void install()}
          >
            <Download />
            {busy ? "Opening installer…" : "Install app"}
          </button>
        ) : isIos ? (
          <div className="install-instructions">
            <Share />
            <p>
              Tap <strong>Share</strong>, then choose{" "}
              <strong>Add to Home Screen</strong>.
            </p>
          </div>
        ) : (
          <div className="install-instructions">
            <Download />
            <p>
              Open your browser menu and choose <strong>Install app</strong> or{" "}
              <strong>Add to Home screen</strong>.
            </p>
          </div>
        )}
        <button className="install-later" onClick={dismiss}>
          Maybe later
        </button>
      </section>
    </div>
  );
}
