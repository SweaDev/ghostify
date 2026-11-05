import type { LoginIndicator, View } from './model';

export const PANEL_CSS = `
:host { all: initial; }
.panel {
  position: fixed; z-index: 2147483647; top: 16px; right: 16px; width: 320px;
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #18181b;
  background: #fff; border: 1px solid #d6ccff; border-radius: 14px; padding: 16px;
  box-shadow: 0 16px 40px rgba(30, 27, 75, .25);
}
h2 { margin: 0 0 4px; font-size: 15px; }
p { margin: 0 0 10px; color: #52525b; }
label { display: flex; gap: 8px; align-items: center; padding: 6px 8px; border-radius: 8px; cursor: pointer; }
label:hover { background: #f4f2ff; }
.ind { margin-top: 8px; padding: 8px; border-radius: 8px; background: #fafafa; }
.ind code { word-break: break-all; font-size: 12px; }
.row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
button { font: inherit; border-radius: 8px; padding: 6px 12px; cursor: pointer; border: 1px solid #d4d4d8; background: #fff; }
button.primary { background: #7c5cff; border-color: #7c5cff; color: #fff; }
`;

export interface ViewChoice {
  view: View;
  indicator?: LoginIndicator;
}

export interface ChooserOptions {
  /** Detected/current indicator, shown and kept unless re-picked. */
  indicator?: LoginIndicator;
  /** Lets the user pick the login indicator element; resolves with its selector. */
  pickIndicator?(): Promise<string | undefined>;
}

/** Asks which page view the confirmed feeds belong to. Resolves null on cancel. */
export function chooseView(doc: Document, opts: ChooserOptions = {}): Promise<ViewChoice | null> {
  const host = doc.createElement('div');
  host.setAttribute('data-ghostify-chooser', '');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${PANEL_CSS}</style>
<div class="panel" role="dialog" aria-label="Ghostify: which view?">
  <h2>Which view is this?</h2>
  <p>Sites can show different feeds when you are logged in. Ghostify keeps separate selectors per view.</p>
  <label><input type="radio" name="view" value="any" checked> Any view</label>
  <label><input type="radio" name="view" value="loggedOut"> Logged out only</label>
  <label><input type="radio" name="view" value="loggedIn"> Logged in only</label>
  <div class="ind" hidden>
    <div>Login indicator: <code class="sel"></code></div>
    <div class="row" style="justify-content:flex-start;margin-top:6px">
      <button type="button" class="pick">Pick an element shown only in this view</button>
    </div>
  </div>
  <div class="row">
    <button type="button" class="cancel">Cancel</button>
    <button type="button" class="primary save">Save</button>
  </div>
</div>`;
  doc.documentElement.append(host);

  let indicator = opts.indicator;
  const $ = <T extends Element>(s: string) => root.querySelector(s) as T;
  const ind = $<HTMLElement>('.ind');
  const view = () => ($<HTMLInputElement>('input[name=view]:checked').value as View) ?? 'any';
  const render = () => {
    ind.hidden = view() === 'any';
    $<HTMLElement>('.sel').textContent = indicator
      ? `${indicator.selector} (present = ${indicator.whenPresent === 'loggedIn' ? 'logged in' : 'logged out'})`
      : 'none, so both views will match';
    const pick = $<HTMLElement>('.pick');
    pick.hidden = !opts.pickIndicator;
    pick.textContent = `Pick an element shown only when ${view() === 'loggedIn' ? 'logged in' : 'logged out'}`;
  };
  render();
  for (const r of root.querySelectorAll('input[name=view]')) r.addEventListener('change', render);

  return new Promise((resolve) => {
    const done = (v: ViewChoice | null) => {
      host.remove();
      resolve(v);
    };
    $('.pick').addEventListener('click', async () => {
      host.style.display = 'none';
      const selector = await opts.pickIndicator?.().catch(() => undefined);
      host.style.display = '';
      const v = view();
      if (selector && v !== 'any') indicator = { selector, whenPresent: v };
      render();
    });
    $('.cancel').addEventListener('click', () => done(null));
    $('.save').addEventListener('click', () =>
      done({ view: view(), indicator: view() === 'any' ? undefined : indicator }),
    );
  });
}

/** A short-lived message in the same panel style. */
export function notice(doc: Document, message: string, ms = 6000): void {
  const host = doc.createElement('div');
  host.setAttribute('data-ghostify-chooser', '');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${PANEL_CSS}</style><div class="panel" role="status"><p></p></div>`;
  (root.querySelector('p') as HTMLElement).textContent = message;
  doc.documentElement.append(host);
  setTimeout(() => host.remove(), ms);
}
