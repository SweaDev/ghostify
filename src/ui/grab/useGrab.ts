import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  type AgentMessage,
  GRAB_PORT,
  type GrabCommand,
  type GrabState,
  type PanelMessage,
} from '../../grab/protocol';

export interface GrabConnection {
  state?: GrabState;
  closed?: 'saved' | 'cancelled' | 'lost';
  send(cmd: GrabCommand): void;
}

/** Connects the panel page to its tab's page agent (`?tab=&token=&mode=`). */
export function useGrab(search = location.search): GrabConnection {
  const [state, setState] = useState<GrabState>();
  const [closed, setClosed] = useState<GrabConnection['closed']>();
  const port = useRef<Browser.runtime.Port | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(search);
    const tabId = Number(q.get('tab'));
    const token = q.get('token') ?? '';
    const mode = q.get('mode') === 'window' ? 'window' : 'docked';
    if (!Number.isInteger(tabId) || !token) {
      setClosed('lost');
      return;
    }
    const p = browser.tabs.connect(tabId, { name: GRAB_PORT, frameId: 0 });
    port.current = p;
    p.onMessage.addListener((m: AgentMessage) => {
      if ('state' in m) setState(m.state);
      else {
        setClosed(m.closed);
        if (mode === 'window') window.close();
      }
    });
    p.onDisconnect.addListener(() => {
      port.current = null;
      setClosed((c) => c ?? 'lost');
    });
    p.postMessage({ hello: token, mode } satisfies PanelMessage);
    return () => p.disconnect();
  }, [search]);

  return {
    state,
    closed,
    send: (cmd) => port.current?.postMessage({ cmd } satisfies PanelMessage),
  };
}
