import { storage } from 'wxt/utils/storage';
import { framePanel } from '@/src/sites/panel';

const panel = () => {
  const p = document.createElement('div');
  p.className = 'panel';
  p.append(document.createElement('h2'));
  document.body.append(p);
  return p;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('framePanel', () => {
  it('adds a header with the step and collapses the panel', () => {
    const p = panel();
    framePanel(p, 'Step 2 of 4 · Post link');
    const bar = p.firstElementChild as HTMLElement;
    expect(bar.className).toBe('bar');
    expect(bar.querySelector('.step')?.textContent).toBe('Step 2 of 4 · Post link');
    const fold = bar.querySelector('button') as HTMLButtonElement;
    fold.click();
    expect(p.classList.contains('collapsed')).toBe(true);
    expect(fold.getAttribute('aria-label')).toBe('Expand panel');
    fold.click();
    expect(p.classList.contains('collapsed')).toBe(false);
  });

  it('moves with the arrow keys, keeps on screen and remembers the place per site', async () => {
    const p = panel();
    framePanel(p, 'Step');
    const bar = p.firstElementChild as HTMLElement;
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(p.style.top).toBe('24px');
    expect(p.style.right).toBe('auto');
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(p.style.left).toBe('0px');
    await vi.waitFor(async () =>
      expect(await storage.getItem('local:pickerPanel')).toEqual({
        [location.hostname]: { left: 0, top: 0 },
      }),
    );

    await storage.setItem('local:pickerPanel', { [location.hostname]: { left: 50, top: 60 } });
    const q = panel();
    framePanel(q, 'Step');
    await vi.waitFor(() => expect(q.style.top).toBe('60px'));
    expect(q.style.left).toBe('50px');
  });
});
