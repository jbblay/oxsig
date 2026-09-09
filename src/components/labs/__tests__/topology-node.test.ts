import { describe, expect, it } from 'vitest';
import { LAB_CATALOG } from '@/lib/labs/catalog';

// The visual topology layer depends on every catalog VM carrying the metadata
// needed to render and provision a node without hard-coded OS branches in the UI.
describe('Cyber Lab topology catalog', () => {
  it('provides unique slugs and display metadata for every machine', () => {
    const slugs = LAB_CATALOG.map((lab) => lab.slug);
    expect(new Set(slugs).size).toBe(slugs.length);

    for (const lab of LAB_CATALOG) {
      expect(lab.shortName).toBeTruthy();
      expect(lab.osFamily).toBeTruthy();
      expect(lab.platform).toBeTruthy();
      expect(lab.shell).toBeTruthy();
      expect(lab.recommendedInstanceType).toMatch(/^t3\./);
    }
  });

  it('keeps unavailable profiles explicit about why they cannot be launched directly', () => {
    for (const lab of LAB_CATALOG.filter((item) => !item.available)) {
      expect(lab.availabilityNote).toBeTruthy();
    }
  });

  it('keeps unavailable Marketplace machines explicit instead of silently launchable', () => {
    const marketplaceLabs = LAB_CATALOG.filter((item) => Boolean(item.marketplaceProductCode));
    expect(marketplaceLabs.length).toBeGreaterThan(0);

    for (const lab of marketplaceLabs) {
      expect(lab.available).toBe(false);
      expect(lab.marketplaceProductCode).toBeTruthy();
      expect(lab.availabilityNote).toMatch(/Marketplace/i);
    }
  });
});
