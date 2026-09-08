import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('@/components/labs/LabTopologyDurableStateProvider', () => ({ default: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/labs/LabRuntimePanel', () => ({ default: () => <input aria-label="Runtime session input" defaultValue="" /> }));
vi.mock('@/components/labs/InfrastructureDesigner', () => ({ default: () => <div>Topology designer</div> }));
vi.mock('@/components/labs/DeploymentEvidenceReview', () => ({ default: () => <div>Deployment evidence</div> }));
vi.mock('@/components/labs/DeploymentPlanner', () => ({ default: () => null }));
vi.mock('@/components/labs/RuntimeReadinessReview', () => ({ default: () => null }));
vi.mock('@/components/labs/GuestServiceReadinessReview', () => ({ default: () => null }));
vi.mock('@/components/labs/AccessPathReadinessReview', () => ({ default: () => null }));

import CyberLabWorkspace from './CyberLabWorkspace';

describe('Cyber Lab workspace navigation', () => {
  beforeEach(() => window.localStorage.clear());

  it('opens evidence directly and preserves the mounted runtime when switching tools', () => {
    render(<CyberLabWorkspace />);
    const session = screen.getByLabelText('Runtime session input');
    fireEvent.change(session, { target: { value: 'unfinished command' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Evidence', exact: true }));
    expect(screen.getByRole('tabpanel', { name: 'Evidence' })).toBeVisible();
    expect(session).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'My Lab', exact: true }));
    expect(screen.getByLabelText('Runtime session input')).toBe(session);
    expect(session).toHaveValue('unfinished command');
  });

  it('moves focus and selection through the primary tools with arrow and boundary keys', () => {
    render(<CyberLabWorkspace />);
    const runtime = screen.getByRole('tab', { name: 'My Lab', exact: true });
    fireEvent.keyDown(runtime, { key: 'ArrowRight' });
    const build = screen.getByRole('tab', { name: 'Build', exact: true });
    expect(build).toHaveFocus();
    expect(build).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(build, { key: 'End' });
    const evidence = screen.getByRole('tab', { name: 'Evidence', exact: true });
    expect(evidence).toHaveFocus();
    expect(evidence).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(evidence, { key: 'Home' });
    expect(runtime).toHaveFocus();
    expect(runtime).toHaveAttribute('aria-selected', 'true');
  });
});
