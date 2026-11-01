import { selectorFor } from '@/src/sites/selector';

describe('selectorFor', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <header><a id="me" href="/me">Me</a><button class="btn user-menu">U</button>
      <a class="nav" href="/enter">Log in</a><a class="nav" href="/signup">Sign up</a></header>
      <ul><li class="x1y2">a</li><li class="x1y2">b</li></ul>`;
  });
  const check = (el: Element) => {
    const sel = selectorFor(el);
    expect(document.querySelectorAll(sel)).toHaveLength(1);
    expect(document.querySelector(sel)).toBe(el);
    return sel;
  };

  it('prefers ids, readable classes and hrefs', () => {
    expect(check(document.getElementById('me') as Element)).toBe('#me');
    expect(check(document.querySelector('.user-menu') as Element)).toBe('button.btn');
    expect(check(document.querySelector('[href="/enter"]') as Element)).toBe('a[href="/enter"]');
  });

  it('falls back to a structural path', () => {
    check(document.querySelectorAll('li')[1] as Element);
  });
});
