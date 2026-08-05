import { describe, expect, it } from 'vitest';
import { shouldLaunchTeachingOnPublish } from './bridge-offering';

describe('shouldLaunchTeachingOnPublish', () => {
  it('fires only on the draft → published transition', () => {
    expect(
      shouldLaunchTeachingOnPublish({ wasPublished: false, nowPublished: true }),
    ).toBe(true);
  });

  it('does not re-fire when an already-published page is saved again', () => {
    expect(
      shouldLaunchTeachingOnPublish({ wasPublished: true, nowPublished: true }),
    ).toBe(false);
  });

  it('does not fire on unpublish or draft saves', () => {
    expect(
      shouldLaunchTeachingOnPublish({ wasPublished: true, nowPublished: false }),
    ).toBe(false);
    expect(
      shouldLaunchTeachingOnPublish({ wasPublished: false, nowPublished: false }),
    ).toBe(false);
  });
});
