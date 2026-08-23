import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Input, Textarea, Select, Checkbox, Radio } from './Form';

/**
 * These primitives rendered a caption beside a control with nothing joining them —
 * no htmlFor, no id — so a screen reader announced most of the product's fields as
 * an unlabelled edit box, and the caption was not a click target either.
 *
 * The association is generated at runtime through useId, which means a static scan
 * cannot confirm it. This renders the markup and reads it back instead, so the fix
 * is evidence rather than a claim.
 */

const attr = (html: string, tag: string, name: string): string | null => {
  const open = html.match(new RegExp(`<${tag}\\b[^>]*>`, 'i'));
  if (!open) return null;
  const found = open[0].match(new RegExp(`${name}="([^"]*)"`));
  return found ? found[1] : null;
};

const labelFor = (html: string): string | null => attr(html, 'label', 'for');

describe('shared form primitives expose a programmatic accessible name', () => {
  const cases: Array<[string, (label: string) => React.ReactElement, string]> = [
    ['Input', (label) => <Input label={label} />, 'input'],
    ['Textarea', (label) => <Textarea label={label} />, 'textarea'],
    ['Select', (label) => <Select label={label} options={[{ value: 'a', label: 'A' }]} />, 'select'],
    ['Checkbox', (label) => <Checkbox label={label} />, 'input'],
    ['Radio', (label) => <Radio label={label} />, 'input'],
  ];

  for (const [name, render, tag] of cases) {
    it(`${name} joins its label to its control`, () => {
      const html = renderToStaticMarkup(render(`${name} caption`));

      const controlId = attr(html, tag, 'id');
      expect(controlId, `${name} rendered no id on its control`).toBeTruthy();

      expect(labelFor(html), `${name} label is not pointed at its control`).toBe(controlId);
      expect(html).toContain(`${name} caption`);
    });
  }

  it('an explicitly supplied id wins, so existing call sites keep their own', () => {
    const html = renderToStaticMarkup(<Input label="Email" id="caller-owned-id" />);
    expect(attr(html, 'input', 'id')).toBe('caller-owned-id');
    expect(labelFor(html)).toBe('caller-owned-id');
  });

  it('a rejected field is announced, not only shown', () => {
    const html = renderToStaticMarkup(<Input label="Email" error="That address is not valid" />);

    expect(attr(html, 'input', 'aria-invalid')).toBe('true');
    const describedBy = attr(html, 'input', 'aria-describedby');
    expect(describedBy, 'error text is not joined to the field').toBeTruthy();
    // The id aria-describedby points at has to exist in the markup, or it announces nothing.
    expect(html).toContain(`id="${describedBy}"`);
    expect(html).toContain('That address is not valid');
  });

  it('helper text is joined when there is no error to take priority', () => {
    const html = renderToStaticMarkup(<Input label="Phone" helperText="Include the country code" />);

    const describedBy = attr(html, 'input', 'aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(html).toContain(`id="${describedBy}"`);
    expect(attr(html, 'input', 'aria-invalid')).toBeNull();
  });

  it('two instances on one page do not share an id', () => {
    const html = renderToStaticMarkup(
      <div>
        <Input label="First" />
        <Input label="Second" />
      </div>,
    );
    const ids = [...html.matchAll(/<input\b[^>]*id="([^"]*)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size, 'duplicate ids would point both labels at one field').toBe(2);
  });
});
