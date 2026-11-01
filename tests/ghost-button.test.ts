import { mountGhostButton } from '@/src/feed/ghost-button';

function setup() {
  document.body.innerHTML = '<ul><li class="item"><p>hi</p></li></ul><footer>x</footer>';
  const onGhost = vi.fn();
  const gb = mountGhostButton(document, {
    resolve: (el) => el.closest('.item') ?? undefined,
    onGhost,
  });
  const btn = gb.host.shadowRoot?.querySelector('button') as HTMLButtonElement;
  return { gb, btn, onGhost };
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
    expect(gb.target).toBeUndefined();
    gb.destroy();
  });

  it('hides outside items and unmounts cleanly', () => {
    const { gb, btn } = setup();
    over(document.querySelector('.item') as Element);
    over(document.querySelector('footer') as Element);
    expect(btn.classList.contains('on')).toBe(false);
    gb.destroy();
    expect(document.querySelector('[data-ghostify]')).toBeNull();
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
