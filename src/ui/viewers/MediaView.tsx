import { ExternalLink, FileText, Loader2, Play, Search, X } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import type { GhostItem } from '../../store/db';
import { duration } from '../format';
import { btn } from '../kit';
import { sanitizeHtml } from '../sanitize';

/**
 * Providers whose players refuse to play inside extension pages (YouTube answers "Error 153"
 * without a web page's referrer), so Ghostify shows the poster and plays them on the site.
 */
const NO_EXTENSION_EMBED = new Set(['youtube']);

const PROVIDER_NAME: Record<string, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  dailymotion: 'Dailymotion',
  spotify: 'Spotify',
  soundcloud: 'SoundCloud',
};

/** A provider player that hasn't loaded after this long gets the "Play on site" hint. */
export const EMBED_TIMEOUT_MS = 6000;

/** Loads the item's page to find what the feed didn't show (its player); resolves true on success. */
export interface Finder {
  find(): Promise<boolean>;
  busy: boolean;
  error?: string;
}

function FindPlayer({ finder }: { finder?: Finder }) {
  if (!finder) return null;
  return (
    <span className="flex flex-col items-center gap-1">
      <button
        type="button"
        className={btn}
        disabled={finder.busy}
        onClick={() => void finder.find()}
      >
        {finder.busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
        Find the player on the page
      </button>
      {finder.error && <span className="text-rose-300 text-xs">{finder.error}</span>}
    </span>
  );
}

/** Opens the original in a small popup window: for players that refuse to play inside Ghostify. */
export function playOnSite(url: string): void {
  void browser.windows.create({ url, type: 'popup', focused: true, width: 1000, height: 700 });
}

function PlayOnSite({ url, label = 'Play on site' }: { url?: string; label?: string }) {
  if (!url) return null;
  return (
    <button type="button" className={btn} onClick={() => playOnSite(url)}>
      <ExternalLink className="size-4" /> {label}
    </button>
  );
}

/** A provider's player in an iframe; offers playing on the site when it doesn't load. */
function EmbedFrame(props: { src: string; title: string; height?: number; fallbackUrl?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [late, setLate] = useState(false);
  // Callers key this by `src`, so a new player starts a new wait.
  useEffect(() => {
    const t = setTimeout(() => setLate(true), EMBED_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="relative bg-black">
      <iframe
        src={props.src}
        title={props.title}
        onLoad={() => setLoaded(true)}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        className={props.height ? 'w-full' : 'aspect-video w-full'}
        style={props.height ? { height: props.height } : undefined}
      />
      {late && !loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-900/90 p-4 text-center text-sm text-zinc-100">
          The player didn't load here; some sites only play on their own pages.
          <PlayOnSite url={props.fallbackUrl} />
        </div>
      )}
    </div>
  );
}

function MediaBar({ item }: { item: GhostItem }) {
  const m = item.media;
  const facts = [
    m?.provider && m.provider !== 'file' ? (PROVIDER_NAME[m.provider] ?? m.provider) : undefined,
    m?.duration ? duration(m.duration) : undefined,
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-2 px-5 pt-3 text-xs text-zinc-500 dark:text-zinc-400">
      {facts.length > 0 && <span>{facts.join(' · ')}</span>}
      <span className="ml-auto">
        <PlayOnSite url={item.url ?? m?.url} />
      </span>
    </div>
  );
}

function VideoView({ item, finder }: { item: GhostItem; finder?: Finder }) {
  const m = item.media;
  const poster = m?.poster ?? item.image;
  const [failed, setFailed] = useState(false);
  let player: ReactNode;
  if (m?.url && !failed) {
    player = (
      // biome-ignore lint/a11y/useMediaCaption: third-party media without caption tracks
      <video
        controls
        preload="metadata"
        poster={poster}
        src={m.url}
        onError={() => setFailed(true)}
        className="aspect-video w-full bg-black"
      />
    );
  } else if (m?.embedUrl && !NO_EXTENSION_EMBED.has(m.provider ?? '')) {
    player = (
      <EmbedFrame
        key={m.embedUrl}
        src={m.embedUrl}
        title={item.title}
        fallbackUrl={item.url ?? m.url}
      />
    );
  } else {
    player = (
      <div className="relative aspect-video w-full bg-zinc-900">
        {poster && <img src={poster} alt="" className="size-full object-cover opacity-70" />}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <button
            type="button"
            aria-label="Play on site"
            disabled={!item.url}
            onClick={() => item.url && playOnSite(item.url)}
            className="flex size-16 items-center justify-center rounded-full bg-white/90 text-zinc-900 shadow-lg transition hover:scale-105"
          >
            <Play className="size-7" />
          </button>
          {m?.embedUrl ? (
            <span className="rounded-full bg-zinc-900/70 px-3 py-1 text-white text-xs">
              Plays on {m.provider === 'youtube' ? 'YouTube' : 'its site'} in a small window
            </span>
          ) : (
            <FindPlayer finder={finder} />
          )}
        </div>
      </div>
    );
  }
  return (
    <>
      {player}
      <MediaBar item={item} />
    </>
  );
}

const EMBED_HEIGHT: Record<string, number> = { spotify: 152, soundcloud: 166 };

function AudioView({ item, finder }: { item: GhostItem; finder?: Finder }) {
  const m = item.media;
  const cover = m?.poster ?? item.image;
  return (
    <>
      <div className="flex items-center gap-4 bg-gradient-to-br from-ghost-100 to-ghost-200 p-5 dark:from-ghost-900 dark:to-zinc-900">
        {cover && (
          <img src={cover} alt="" className="size-20 shrink-0 rounded-xl object-cover shadow" />
        )}
        <div className="min-w-0 flex-1">
          {m?.url ? (
            // biome-ignore lint/a11y/useMediaCaption: third-party audio without caption tracks
            <audio controls preload="metadata" src={m.url} className="w-full" />
          ) : m?.embedUrl ? (
            <EmbedFrame
              key={m.embedUrl}
              src={m.embedUrl}
              title={item.title}
              height={EMBED_HEIGHT[m.provider ?? ''] ?? 160}
              fallbackUrl={item.url}
            />
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              <PlayOnSite url={item.url} label="Listen on site" />
              <FindPlayer finder={finder} />
            </span>
          )}
        </div>
      </div>
      <MediaBar item={item} />
    </>
  );
}

function PdfView({ item }: { item: GhostItem }) {
  const src = item.media?.url ?? item.url;
  if (!src) return null;
  return (
    <div className="flex flex-col">
      <iframe
        src={src}
        title={item.title}
        className="h-[70vh] w-full bg-zinc-100 dark:bg-zinc-950"
      />
      <div className="flex items-center gap-2 px-5 pt-3 text-xs text-zinc-500">
        <FileText className="size-4" /> PDF shown with your browser's viewer
        <a href={src} target="_blank" rel="noopener noreferrer" className={`${btn} ml-auto`}>
          <ExternalLink className="size-4" /> Open PDF
        </a>
      </div>
    </div>
  );
}

function ImageView({ item }: { item: GhostItem }) {
  const images = item.images?.length ? item.images : item.image ? [{ src: item.image }] : [];
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const first = images[0];
  if (!first) return null;
  const shown = open === null ? undefined : images[open];
  return (
    <>
      <button
        type="button"
        aria-label="Show image"
        className="block w-full cursor-zoom-in bg-zinc-950"
        onClick={() => setOpen(0)}
      >
        <img
          src={first.src}
          srcSet={first.srcset}
          alt={first.alt ?? ''}
          className="mx-auto max-h-[60vh] object-contain"
        />
      </button>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-5 pt-3">
          {images.map((img, i) => (
            <button
              key={img.src}
              type="button"
              aria-label={`Show image ${i + 1}`}
              onClick={() => setOpen(i)}
            >
              <img src={img.src} alt={img.alt ?? ''} className="size-14 rounded-lg object-cover" />
            </button>
          ))}
        </div>
      )}
      {shown && (
        <div
          role="dialog"
          aria-label="Image"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setOpen(null)}
          onKeyDown={() => {}}
        >
          <img
            src={shown.src}
            srcSet={shown.srcset}
            alt={shown.alt ?? ''}
            className="max-h-full max-w-full object-contain"
          />
          <button
            type="button"
            aria-label="Close image"
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setOpen(null)}
          >
            <X className="size-5" />
          </button>
        </div>
      )}
    </>
  );
}

/** The item itself, the way its kind is best seen: a player, a picture, a PDF or a cover image. */
export function MediaView({ item, finder }: { item: GhostItem; finder?: Finder }) {
  switch (item.kind) {
    case 'video':
      return <VideoView item={item} finder={item.url ? finder : undefined} />;
    case 'audio':
      return <AudioView item={item} finder={item.url ? finder : undefined} />;
    case 'pdf':
      return <PdfView item={item} />;
    case 'image':
      return <ImageView item={item} />;
    default:
      return item.image ? (
        <img src={item.image} alt="" className="aspect-[2/1] w-full object-cover" />
      ) : null;
  }
}

/** The post's own content as it showed in the feed (sanitized), for posts and images. */
export function InFeedContent({ item }: { item: GhostItem }) {
  const html = item.html ? sanitizeHtml(item.html) : '';
  if (!html) return null;
  return (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized with DOMPurify
    <div className="reader text-sm" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
