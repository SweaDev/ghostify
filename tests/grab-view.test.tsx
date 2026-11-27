import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { GrabCommand, GrabState } from '@/src/grab/protocol';
import { GrabView } from '@/src/ui/grab/GrabView';

const css = (value: string) => ({ type: 'css' as const, value });

const state = (over: Partial<GrabState> = {}): GrabState => ({
  host: 'tube.test',
  url: 'https://tube.test/',
  editing: false,
  step: 'feeds',
  feeds: [
    {
      id: 'f1',
      accepted: true,
      container: css('.grid'),
      item: css(':scope > .card'),
      items: 8,
      type: 'video',
      detected: 'video',
      confidence: 0.92,
      source: 'heuristic',
      exclude: [],
      include: [],
    },
    {
      id: 'f2',
      accepted: false,
      container: css('nav'),
      item: css(':scope > a'),
      items: 3,
      type: 'post',
      detected: 'post',
      confidence: 0.5,
      source: 'heuristic',
      exclude: [],
      include: [],
    },
  ],
  selected: 'f1',
  pathPattern: '/',
  view: 'any',
  ignore: [],
  dock: { side: 'right', size: 400, mode: 'docked' },
  imageOrigins: ['https://i.test/*'],
  ...over,
});

const content = {
  feedId: 'f1',
  type: 'video' as const,
  detected: 'video' as const,
  declared: false,
  kinds: { post: 0, image: 0, video: 1, audio: 0, pdf: 0 },
  fields: [
    { field: 'title' as const, value: 'Harbor lights', coverage: 1, candidates: [] },
    { field: 'duration' as const, value: '754', coverage: 0.5, candidates: [] },
    { field: 'author' as const, coverage: 0, candidates: [] },
  ],
  items: 8,
  reference: 0,
  preview: {
    kind: 'video' as const,
    title: 'Harbor lights',
    excerpt: '',
    duration: 754,
    provider: 'youtube',
  },
  link: { options: [], selected: -1, selector: css(''), found: 8, params: [], own: false },
  parts: [],
  matching: 8,
};

afterEach(cleanup);

function setup(s: GrabState) {
  const sent: GrabCommand[] = [];
  render(<GrabView state={s} send={(c) => sent.push(c)} />);
  return sent;
}

describe('grab panel', () => {
  it('lists feeds with their type and sends feed commands', () => {
    const sent = setup(state());
    expect(screen.getByText('Videos')).toBeTruthy();
    expect(screen.getByText(/8 items · heuristic · 92% sure/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Keep feed 2'));
    fireEvent.click(screen.getByLabelText('Show feed 1'));
    fireEvent.click(screen.getByText('Pick on the page'));
    fireEvent.click(screen.getByText('Next'));
    expect(sent).toEqual([
      { type: 'toggle', id: 'f2' },
      { type: 'show', id: 'f1' },
      { type: 'inspect' },
      { type: 'step', step: 'content' },
    ]);
  });

  it('folds advanced options away until asked', () => {
    setup(state());
    expect(screen.queryByText('Container')).toBeNull();
    fireEvent.click(screen.getByText('Advanced options'));
    expect(screen.getByText('Container')).toBeTruthy();
  });

  it('docks, pops out and closes from the header; a window has no dock buttons', () => {
    const sent = setup(state());
    fireEvent.click(screen.getByLabelText('Dock to the bottom'));
    fireEvent.click(screen.getByLabelText('Open in its own window'));
    fireEvent.click(screen.getByLabelText('Close without saving'));
    expect(sent).toEqual([
      { type: 'dock', side: 'bottom' },
      { type: 'popOut' },
      { type: 'cancel' },
    ]);
    cleanup();
    setup(state({ dock: { side: 'right', size: 400, mode: 'window' } }));
    expect(screen.queryByLabelText('Dock right')).toBeNull();
  });

  it('shows the content step: type, preview and attributes with coverage and Pick', () => {
    const sent = setup(state({ step: 'content', content }));
    expect(screen.getByLabelText('Content type')).toBeTruthy();
    expect(screen.getAllByText('Harbor lights').length).toBeGreaterThan(0);
    expect(screen.getAllByText('12:34').length).toBeGreaterThan(0);
    expect(screen.getByTitle('Found in 4 of 8 items')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Pick Author'));
    fireEvent.change(screen.getByLabelText('Content type'), { target: { value: 'post' } });
    fireEvent.click(screen.getByLabelText('Next sample item'));
    expect(sent).toEqual([
      { type: 'pickField', field: 'author' },
      { type: 'setType', contentType: 'post' },
      { type: 'reference', index: 1 },
    ]);
  });

  it('shows the save step with view, login indicator and thumbnails, and the picking banner', () => {
    const sent = setup(state({ step: 'save', view: 'loggedIn', picking: 'indicator' }));
    expect(screen.getByText(/Asks to fetch images from i.test/)).toBeTruthy();
    expect(screen.getByText('Click an element shown only in this view.')).toBeTruthy();
    fireEvent.click(screen.getByText('Cancel'));
    fireEvent.click(within(screen.getByRole('group')).getByLabelText(/Any view/));
    expect(sent).toEqual([{ type: 'cancelPick' }, { type: 'setView', view: 'any' }]);
  });
});
