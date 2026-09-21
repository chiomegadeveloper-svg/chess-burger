"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Heart, Trash2 } from "lucide-react";
import { arena } from "./arena-client";

type Testimonial = {
  id: string;
  author_id: string;
  display_name: string;
  username: string;
  avatar_url: string;
  body: string;
  heart_count: number;
  hearted: boolean;
  created_at: string;
};

type TestimonialPage = {
  testimonials: Testimonial[];
  total: number;
  page: number;
  pages: number;
  authored: boolean;
  authoredId: string | null;
};

export default function Testimonials({
  profileId,
  currentUserId,
}: {
  profileId: string;
  currentUserId?: string;
}) {
  const [items, setItems] = useState<Testimonial[]>([]);
  const [body, setBody] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [authored, setAuthored] = useState(false);
  const [authoredId, setAuthoredId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      arena<TestimonialPage>("profile-testimonials", {
        user_id: profileId,
        page,
      })
        .then((data) => {
          setItems(data.testimonials);
          setTotal(data.total);
          setPages(data.pages);
          setAuthored(data.authored);
          setAuthoredId(data.authoredId);
          if (data.page !== page) setPage(data.page);
          setError("");
        })
        .catch((cause) => setError((cause as Error).message)),
    [page, profileId],
  );

  useEffect(() => {
    setPage(1);
  }, [profileId]);

  useEffect(() => {
    if (profileId) void load();
  }, [load, profileId]);

  const act = async (action: string, input: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      await arena(action, input);
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = body.trim();
    if (!message || authored) return;
    await act("testimonial-add", { user_id: profileId, body: message });
    setBody("");
    setPage(1);
  };

  const canPost = Boolean(currentUserId && currentUserId !== profileId && !authored);

  return (
    <section className="testimonials cloud-panel">
      <header>
        <div>
          <span>COMMUNITY VOICES</span>
          <h2>Testimonials</h2>
        </div>
        <small>{total} {total === 1 ? "testimonial" : "testimonials"}</small>
      </header>
      {canPost ? (
        <form onSubmit={submit}>
          <textarea
            value={body}
            maxLength={400}
            required
            placeholder="Write a respectful testimonial…"
            onChange={(event) => setBody(event.target.value)}
          />
          <button className="gold-button" disabled={busy || !body.trim()} type="submit">
            Post testimonial
          </button>
        </form>
      ) : null}
      {authored && currentUserId !== profileId ? (
        <div className="testimonial-notice">
          <span>You already posted a testimonial. Delete yours to write a new one.</span>
          <button type="button" disabled={busy || !authoredId} onClick={() => void act("testimonial-delete", { id: authoredId })}>
            <Trash2 size={13} /> Delete my testimonial
          </button>
        </div>
      ) : null}
      {error ? <p className="inline-error" role="alert">{error}</p> : null}
      {!items.length ? (
        <p className="testimonial-empty">No testimonials yet.</p>
      ) : (
        <div className="testimonial-list">
          {items.map((item) => (
            <article key={item.id}>
              <span className="testimonial-avatar">
                {item.avatar_url ? <img src={item.avatar_url} alt="" /> : item.display_name.charAt(0)}
              </span>
              <div>
                <strong>{item.display_name}</strong>
                <small>@{item.username} · {new Date(item.created_at).toLocaleDateString()}</small>
                <p>{item.body}</p>
                <button
                  type="button"
                  className={item.hearted ? "hearted" : ""}
                  disabled={busy}
                  onClick={() => void act("testimonial-heart", { id: item.id })}
                >
                  <Heart size={14} fill={item.hearted ? "currentColor" : "none"} />
                  {item.heart_count}
                </button>
              </div>
              {currentUserId === profileId || currentUserId === item.author_id ? (
                <button
                  type="button"
                  className="testimonial-delete"
                  disabled={busy}
                  aria-label="Delete testimonial"
                  onClick={() => void act("testimonial-delete", { id: item.id })}
                >
                  <Trash2 size={15} />
                </button>
              ) : null}
            </article>
          ))}
        </div>
      )}
      {pages > 1 ? (
        <nav className="testimonial-pagination" aria-label="Testimonial pages">
          <button type="button" disabled={busy || page <= 1} onClick={() => setPage((value) => value - 1)}>
            <ChevronLeft size={14} /> Previous
          </button>
          <span>Page {page} of {pages}</span>
          <button type="button" disabled={busy || page >= pages} onClick={() => setPage((value) => value + 1)}>
            Next <ChevronRight size={14} />
          </button>
        </nav>
      ) : null}
    </section>
  );
}
