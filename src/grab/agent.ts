import { createHighlighter, type HighlightEntry, pickElement } from 'feedgrab/overlay';
import { browser } from 'wxt/browser';
import { setPicking } from '../feed/reveal';
import { sendMessage } from '../messaging';
import { getSites, saveSite } from '../sites/registry';
import { loadDock, mountDock, saveDockPrefs } from './dock';
import { type AgentMessage, GRAB_PORT, type PanelMessage } from './protocol';
import { GrabSession } from './session';

/** Set in the tab's isolated world by the background before it injects the picker. */
interface Launch {
  token: string;
  tabId: number;
}
const LAUNCH_KEY = '__ghostifyGrab';

/** The URL of the Grab panel page for this session. */
export function panelUrl(launch: Launch, mode: 'docked' | 'window'): string {
  const q = new URLSearchParams({ tab: String(launch.tabId), token: launch.token, mode });
  return `${browser.runtime.getURL('/grab.html')}?${q}`;
}

/**
 * Runs the Grab panel on this page: docks the panel (or follows it into its own window), drives
 * feedgrab on the page for it, and saves the site when the user is done. One session per page.
 */
export async function runGrab(doc: Document = document): Promise<void> {
  const started = (globalThis as Record<string, unknown>)[LAUNCH_KEY] as Launch | undefined;
  if (!started || doc.querySelector('[data-ghostify-grab]')) return;
  const launch: Launch = started;
  // Ghostified items show (veiled) while grabbing, so a feed of only ghostified items is found.
  setPicking(doc, true);
  const prefs = await loadDock();
  let session: GrabSession | undefined;
  const dock = mountDock(doc, {
    src: panelUrl(launch, 'docked'),
    prefs,
    onResize: (size) => void session?.run({ type: 'resize', size }),
  });
  const hl = createHighlighter(doc, dock.layer);
  let shown: HighlightEntry[] = [];
  let picking: AbortController | undefined;
  const ports = new Set<Browser.runtime.Port>();
  const post = (m: AgentMessage) => {
    for (const p of ports) p.postMessage(m);
  };

  const close = (result: 'saved' | 'cancelled') => {
    post({ closed: result });
    picking?.abort();
    hl.destroy();
    dock.destroy();
    browser.runtime.onConnect.removeListener(onConnect);
    setPicking(doc, false);
    (globalThis as Record<string, unknown>)[LAUNCH_KEY] = undefined;
    if (result === 'saved') location.reload();
  };

  session = new GrabSession({
    doc,
    url: location.href,
    getSites,
    saveSite,
    saveSample: (s) => sendMessage('saveSample', s),
    pick: (filter) => {
      picking?.abort();
      picking = new AbortController();
      return pickElement(doc, {
        filter: (el) => !dock.host.contains(el) && filter(el),
        signal: picking.signal,
        onHover: (el) => hl.set(el ? [...shown, { el, kind: 'hover' }] : shown),
      });
    },
    cancelPick: () => picking?.abort(),
    highlight: (entries) => {
      shown = entries;
      hl.set(entries);
    },
    scrollTo: (el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' }),
    dock: prefs,
    saveDock: (p) => {
      void saveDockPrefs(p);
      dock.setPrefs(p);
    },
    popOut: () => {
      void sendMessage('openGrabWindow', { token: launch.token });
      dock.hide();
    },
    close,
  });

  function onConnect(port: Browser.runtime.Port) {
    if (port.name !== GRAB_PORT) return;
    let ready = false;
    let mode: 'docked' | 'window' = 'docked';
    let unsubscribe = () => {};
    port.onMessage.addListener((m: PanelMessage) => {
      if (!ready) {
        if (!('hello' in m) || m.hello !== launch.token) return port.disconnect();
        ready = true;
        mode = m.mode;
        ports.add(port);
        unsubscribe = (session as GrabSession).onChange((state) => port.postMessage({ state }));
        return;
      }
      if ('cmd' in m) void session?.run(m.cmd);
    });
    port.onDisconnect.addListener(() => {
      ports.delete(port);
      unsubscribe();
      // Closing the panel's own window brings the docked panel back.
      if (ready && mode === 'window' && session?.state.dock.mode === 'window') {
        dock.show();
        session.state = { ...session.state, dock: { ...session.state.dock, mode: 'docked' } };
        post({ state: session.state });
      }
    });
  }
  browser.runtime.onConnect.addListener(onConnect);
  await session.init();
}
