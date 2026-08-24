import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BuilderSection } from './workflow-panels';

describe('BuilderSection interaction structure', () => {
  it('renders collapsible headers and actions as sibling buttons', () => {
    const markup = renderToStaticMarkup(
      <BuilderSection
        title="Setup"
        collapsible
        defaultOpen={false}
        actions={<button type="button">Another class</button>}
      >
        <p>Settings</p>
      </BuilderSection>,
    );

    const firstButton = markup.indexOf('<button');
    const firstClose = markup.indexOf('</button>', firstButton);
    const secondButton = markup.indexOf('<button', firstButton + 1);

    expect(markup).toContain('aria-expanded="false"');
    expect(firstButton).toBeGreaterThan(-1);
    expect(secondButton).toBeGreaterThan(firstClose);
    expect(markup.match(/<button/g)).toHaveLength(2);
  });
});
