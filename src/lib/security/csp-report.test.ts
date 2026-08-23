import { parseCspObservation } from './csp-report';

describe('CSP report sanitization', () => {
  it('removes query strings, fragments, and credentials', () => {
    expect(parseCspObservation({
      'csp-report': {
        'document-uri': 'https://user:secret@www.rillcod.com/dashboard?token=secret#x',
        'blocked-uri': 'https://cdn.example/script.js?customer=one',
        'violated-directive': 'script-src-elem',
      },
    })).toMatchObject({
      document_path: 'https://www.rillcod.com/dashboard',
      blocked_origin: 'https://cdn.example/script.js',
      violated_directive: 'script-src-elem',
    });
  });

  it('ignores malformed reports without useful evidence', () => {
    expect(parseCspObservation({ hello: 'world' })).toBeNull();
  });
});
