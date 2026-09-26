import { avatarFrame } from "./avatar-frame-catalog";
import "./avatar-frames.css";

export function AvatarFrameOverlay({ frameId }: { frameId?: string | null }) {
  const frame = avatarFrame(frameId);
  if (!frame) return null;
  return <span className={`avatar-frame-overlay avatar-frame-${frame.tier}`} style={{ backgroundPosition: `${(frame.index % 5) * 25}% ${Math.floor(frame.index / 5) * 100}%` }} aria-hidden="true" />;
}

export function AvatarFrameArt({ frameId, photo, name }: { frameId: string; photo?: string; name?: string }) {
  const frame = avatarFrame(frameId);
  if (!frame) return null;
  return <span className="avatar-frame-art" role="img" aria-label={`${frame.name} avatar frame`}>
    <span className="avatar-frame-photo">{photo ? <img src={photo} alt="" /> : (name?.charAt(0) || "♟")}</span>
    <AvatarFrameOverlay frameId={frameId} />
  </span>;
}
