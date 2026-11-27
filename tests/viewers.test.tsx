// @vitest-environment jsdom
// DOMPurify (in-feed HTML) needs a spec-complete DOM, as in tests/reader.test.ts.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { GhostItem } from '@/src/store/db';
import { EMBED_TIMEOUT_MS, InFeedContent, MediaView } from '@/src/ui/viewers/MediaView';

const base: GhostItem = {
  key: 'v.test:a',
  id: 'a',
  host: 'v.test',
  siteId: 'v',
  view: 'any',
  title: 'A thing',
  excerpt: '',
  url: 'https://v.test/watch/a',
  state: 'ghost',
  createdAt: 1,
  updatedAt: 1,
};
const item = (over: Partial<GhostItem>): GhostItem => ({ ...base, ...over });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('viewers', () => {
  it('plays a direct video with its poster, and shows provider and duration', () => {
    const { container } = render(
      <MediaView
        item={item({
          kind: 'video',
          media: {
            kind: 'video',
            url: 'https://cdn.test/a.mp4',
            poster: 'https://cdn.test/a.jpg',
            duration: 754,
          },
        })}
      />,
    );
    const video = container.querySelector('video');
    expect(video?.getAttribute('src')).toBe('https://cdn.test/a.mp4');
    expect(video?.getAttribute('poster')).toBe('https://cdn.test/a.jpg');
    expect(screen.getByText('12:34')).toBeTruthy();
  });

  it('embeds a provider player and offers Play on site when it does not load', () => {
    vi.useFakeTimers();
    const create = vi.spyOn(fakeBrowser.windows, 'create').mockResolvedValue({} as never);
    const { container } = render(
      <MediaView
        item={item({
          kind: 'video',
          media: {
            kind: 'video',
            provider: 'youtube',
            providerId: 'x',
            embedUrl: 'https://www.youtube-nocookie.com/embed/x',
          },
        })}
      />,
    );
    const frame = container.querySelector('iframe');
    expect(frame?.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/x');
    expect(frame?.getAttribute('allow')).toContain('fullscreen');
    expect(screen.queryByText(/didn't load/)).toBeNull();
    act(() => vi.advanceTimersByTime(EMBED_TIMEOUT_MS + 1));
    expect(screen.getByText(/didn't load/)).toBeTruthy();
    fireEvent.click(screen.getAllByText('Play on site')[0] as HTMLElement);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://v.test/watch/a', type: 'popup' }),
    );
  });

  it('plays audio directly, or in the provider player sized for it', () => {
    const direct = render(
      <MediaView
        item={item({ kind: 'audio', media: { kind: 'audio', url: 'https://cdn.test/e.mp3' } })}
      />,
    );
    expect(direct.container.querySelector('audio')?.getAttribute('src')).toBe(
      'https://cdn.test/e.mp3',
    );
    direct.unmount();
    const spotify = render(
      <MediaView
        item={item({
          kind: 'audio',
          media: {
            kind: 'audio',
            provider: 'spotify',
            embedUrl: 'https://open.spotify.com/embed/episode/x',
          },
        })}
      />,
    );
    expect(spotify.container.querySelector('iframe')?.getAttribute('style')).toContain('152px');
  });

  it('shows PDFs in the browser viewer with an Open PDF link', () => {
    const { container } = render(
      <MediaView
        item={item({ kind: 'pdf', media: { kind: 'pdf', url: 'https://v.test/p.pdf' } })}
      />,
    );
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe('https://v.test/p.pdf');
    expect(container.querySelector('iframe')?.hasAttribute('sandbox')).toBe(false);
    expect(screen.getByText('Open PDF').closest('a')?.getAttribute('href')).toBe(
      'https://v.test/p.pdf',
    );
  });

  it('shows images with srcset and opens them large', () => {
    render(
      <MediaView
        item={item({
          kind: 'image',
          images: [
            {
              src: 'https://i.test/1.jpg',
              srcset: 'https://i.test/1.jpg 1x, https://i.test/1@2x.jpg 2x',
              alt: 'One',
            },
            { src: 'https://i.test/2.jpg', alt: 'Two' },
          ],
        })}
      />,
    );
    expect(screen.getAllByAltText('One')[0]?.getAttribute('srcset')).toContain('2x');
    fireEvent.click(screen.getByLabelText('Show image 2'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows a post cover, and its in-feed HTML sanitized', () => {
    const { container } = render(
      <>
        <MediaView item={item({ image: 'https://i.test/cover.jpg' })} />
        <InFeedContent
          item={item({
            html: '<p onclick="x()">Hi <a href="https://v.test/p">there</a></p><script>alert(1)</script>',
          })}
        />
      </>,
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://i.test/cover.jpg');
    expect(container.innerHTML).not.toContain('script');
    expect(container.innerHTML).not.toContain('onclick');
    expect(container.querySelector('.reader a')?.getAttribute('target')).toBe('_blank');
  });
});
