import type {
  ContentKind,
  FeedContentType,
  FieldCandidate,
  FieldName,
  FieldRule,
  Rule,
  Selector,
} from 'feedgrab';
import type { ParamOption } from '../sites/links';
import type { LoginIndicator, View } from '../sites/model';

/** Port name between the Grab panel page and the page agent (`browser.tabs.connect`). */
export const GRAB_PORT = 'ghostify-grab';

export type GrabStep = 'feeds' | 'content' | 'save';
export type DockSide = 'right' | 'bottom' | 'left';
export interface DockPrefs {
  side: DockSide;
  /** Panel width (left/right) or height (bottom) in px. */
  size: number;
}

/** One proposed or accepted feed of the page. */
export interface GrabFeed {
  id: string;
  accepted: boolean;
  container: Selector;
  item: Selector;
  items: number;
  /** The type items are read as (declared, else detected). */
  type: FeedContentType;
  detected: FeedContentType;
  confidence: number;
  source: string;
  exclude: Rule[];
  include: Rule[];
}

/** One attribute of the selected feed's items. */
export interface FieldRow {
  field: FieldName;
  /** The sample item's value. */
  value?: string;
  /** Share of items with a value. */
  coverage: number;
  /** The field rule, when the user (or a saved site) set one. */
  rule?: FieldRule;
  /** Other ways to read it, best first. */
  candidates: FieldCandidate[];
}

/** How the sample item will look in Ghostify. */
export interface Preview {
  kind: ContentKind;
  title: string;
  excerpt: string;
  image?: string;
  author?: string;
  publishedAt?: string;
  duration?: number;
  provider?: string;
  url?: string;
}

export interface LinkOption {
  label: string;
  selector: Selector;
}

export interface PartRow {
  selector: Selector;
  label?: string;
  required: boolean;
  /** Items that have the part. */
  count: number;
  /** The part's text in the sample item. */
  text: string;
}

/** The selected feed's content step. */
export interface GrabContent {
  feedId: string;
  type: FeedContentType;
  detected: FeedContentType;
  declared: boolean;
  kinds: Record<ContentKind, number>;
  fields: FieldRow[];
  items: number;
  reference: number;
  preview?: Preview;
  link: {
    options: LinkOption[];
    /** Index of the chosen option, -1 for automatic, -2 for a custom selector. */
    selected: number;
    selector: Selector;
    opens?: string;
    found: number;
    params: ParamOption[];
    /** The feed keeps its own parameters instead of the site's list. */
    own: boolean;
  };
  parts: PartRow[];
  /** Items with every required part. */
  matching: number;
}

export interface GrabState {
  host: string;
  url: string;
  /** Editing a site Ghostify already has. */
  editing: boolean;
  step: GrabStep;
  feeds: GrabFeed[];
  selected?: string;
  content?: GrabContent;
  pathPattern: string;
  view: View;
  indicator?: LoginIndicator;
  /** Query parameters the site ignores in every feed. */
  ignore: string[];
  /** What the user is picking on the page, if anything. */
  picking?: 'feed' | 'indicator' | FieldName;
  busy?: string;
  error?: string;
  dock: DockPrefs & { mode: 'docked' | 'window' };
  /** Image hosts of the sample items, to ask for thumbnails at save. */
  imageOrigins: string[];
}

export type GrabCommand =
  | { type: 'select'; id: string }
  | { type: 'toggle'; id: string }
  | { type: 'show'; id: string }
  | { type: 'inspect' }
  | { type: 'setSelectors'; id: string; container: Selector; item: Selector }
  | { type: 'addRule'; id: string; list: 'exclude' | 'include'; selector: Selector }
  | { type: 'addCriteria'; id: string; criteria: string }
  | { type: 'removeRule'; id: string; list: 'exclude' | 'include'; index: number }
  | { type: 'step'; step: GrabStep }
  | { type: 'setType'; contentType: FeedContentType | null }
  | { type: 'reference'; index: number }
  | { type: 'pickField'; field: FieldName }
  | { type: 'setField'; field: FieldName; rule: FieldRule | null }
  | { type: 'highlightField'; field: FieldName | null }
  | { type: 'setLink'; selector: Selector | null }
  | { type: 'setParam'; name: string; kept: boolean }
  | { type: 'ownParams'; own: boolean }
  | { type: 'setPart'; index: number; required: boolean }
  | { type: 'removePart'; index: number }
  | { type: 'suggestParts' }
  | { type: 'setPath'; pattern: string }
  | { type: 'setView'; view: View }
  | { type: 'pickIndicator' }
  | { type: 'clearIndicator' }
  | { type: 'cancelPick' }
  | { type: 'save'; thumbnails: boolean }
  | { type: 'cancel' }
  | { type: 'dock'; side: DockSide }
  | { type: 'resize'; size: number }
  | { type: 'popOut' };

/** Panel → agent. The first message carries the session token. */
export type PanelMessage = { hello: string; mode: 'docked' | 'window' } | { cmd: GrabCommand };

/** Agent → panel. */
export type AgentMessage = { state: GrabState } | { closed: 'saved' | 'cancelled' };
