import { describe, expect, it } from 'vitest';
import { LAB_CATALOG } from './catalog';

describe('LAB_CATALOG', () => {
  it('uses unique slugs for every VM profile', () => {
    const slugs = LAB_CATALOG.map((lab) => lab.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('keeps every VM profile explicit about its OS, shell, and instance size', () => {
    for (const lab of LAB_CATALOG) {
      expect(lab.runtime).toBe('vm');
      expect(lab.osFamily).toBeTruthy();
      expect(lab.recommendedInstanceType).toMatch(/^t3\./);
      expect(lab.defaultCommand.length).toBeGreaterThan(0);
      expect(lab.platform === 'windows' ? lab.shell : 'bash').toBe(lab.shell);
    }
  });

  it('uses PowerShell for Windows and Bash for Linux', () => {
    const windows = LAB_CATALOG.find((lab) => lab.osFamily === 'windows');
    expect(windows?.shell).toBe('powershell');
    expect(windows?.recommendedInstanceType).toBe('t3.small');

    for (const lab of LAB_CATALOG.filter((item) => item.platform === 'linux')) {
      expect(lab.shell).toBe('bash');
    }
  });

  it('does not advertise unaccepted Marketplace images as launchable', () => {
    for (const osFamily of ['rocky', 'kali'] as const) {
      const lab = LAB_CATALOG.find((item) => item.osFamily === osFamily);
      expect(lab?.available).toBe(false);
      expect(lab?.marketplaceProductCode).toBeTruthy();
      expect(lab?.availabilityNote).toMatch(/Marketplace/i);
    }
  });
});
