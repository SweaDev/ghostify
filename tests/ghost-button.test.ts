import { mountGhostButton } from '@/src/feed/ghost-button';

function setup() {
  document.body.innerHTML = '<ul><li class="item"><p>hi</p></li></ul><footer>x</footer>';
  const onGhost = vi.fn();
  const gb = mountGhostButton(document, {
    resolve: (el) => el.closest('.item') ?? undefined,
    onGhost,
  });
  const btn = gb.host.shadowRoot?.querySelector('button') as HTMLButtonElement;
  const aura = gb.host.shadowRoot?.querySelector('.aura') as HTMLElement;
  return { gb, btn, aura, onGhost };
}

const over = (el: Element) => el.dispatchEvent(new Event('pointerover', { bubbles: true }));

describe('ghost button', () => {
  it('shows over a hovered item and ghostifies it on click', async () => {
    const { gb, btn, onGhost } = setup();
    const item = document.querySelector('.item') as Element;
    over(item.querySelector('p') as Element);
    expect(gb.target).toBe(item);
    expect(btn.classList.contains('on')).toBe(true);
    btn.click();
    await vi.waitFor(() => expect(onGhost).toHaveBeenCalledWith(item));
    await vi.waitFor(() => expect(gb.target).toBeUndefined());
    gb.destroy();
  });

  it('haunts the item while the button is hovered', () => {
    const { gb, btn, aura } = setup();
    const item = document.querySelector('.item') as Element;
    item.getBoundingClientRect = () => new DOMRect(10, 20, 200, 100);
    over(item);
    btn.dispatchEvent(new Event('pointerenter'));
    expect(aura.classList.contains('haunt')).toBe(true);
    expect(aura.style.width).toBe('200px');
    expect(aura.style.top).toBe('20px');
    btn.dispatchEvent(new Event('pointerleave'));
    expect(aura.classList.contains('haunt')).toBe(false);
    gb.destroy();
  });

  it('mists the item, ghostifies it, then lifts the mist', async () => {
    vi.useFakeTimers();
    try {
      const { gb, btn, aura, onGhost } = setup();
      const item = document.querySelector('.item') as Element;
      over(item);
      btn.dispatchEvent(new Event('pointerenter'));
      btn.click();
      expect(btn.classList.contains('poof')).toBe(true);
      expect(aura.classList.contains('vanish')).toBe(true);
      expect(onGhost).not.toHaveBeenCalled();
      over(document.querySelector('footer') as Element);
      expect(gb.target).toBe(item);
      await vi.advanceTimersByTimeAsync(320);
      expect(onGhost).toHaveBeenCalledWith(item);
      expect(aura.classList.contains('lift')).toBe(true);
      await vi.advanceTimersByTimeAsync(420);
      expect(gb.target).toBeUndefined();
      expect(aura.className).toBe('aura');
      gb.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('hides outside items and unmounts cleanly', () => {
    const { gb, btn } = setup();
    over(document.querySelector('.item') as Element);
    over(document.querySelector('footer') as Element);
    expect(btn.classList.contains('on')).toBe(false);
    gb.destroy();
    expect(document.querySelector('[data-ghostify]')).toBeNull();
  });

  it('stays visible when an overlay outside the item covers it (hover preview)', () => {
    const { gb, btn } = setup();
    const item = document.querySelector('.item') as Element;
    item.getBoundingClientRect = () => new DOMRect(0, 0, 200, 100);
    const preview = document.createElement('div');
    document.body.append(preview);
    const move = (x: number, y: number) =>
      preview.dispatchEvent(
        new MouseEvent('pointerover', { bubbles: true, clientX: x, clientY: y }),
      );
    over(item);
    move(50, 50);
    expect(gb.target).toBe(item);
    expect(btn.classList.contains('on')).toBe(true);
    move(300, 50);
    expect(btn.classList.contains('on')).toBe(false);
    gb.destroy();
  });

  it('shows a toast with an action', () => {
    const { gb } = setup();
    const run = vi.fn();
    gb.toast('Ghostified', { label: 'Undo', run });
    const action = gb.host.shadowRoot?.querySelector('.toast button') as HTMLButtonElement;
    action.click();
    expect(run).toHaveBeenCalled();
    expect(gb.host.shadowRoot?.querySelector('.toast')).toBeNull();
    gb.destroy();
  });
});
