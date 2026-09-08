import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import WorkspaceWalkthrough from './WorkspaceWalkthrough';

describe('Workspace walkthrough', () => {
  beforeEach(() => window.localStorage.clear());

  it('stays optional, moves between steps, and resumes after being closed', () => {
    render(<WorkspaceWalkthrough />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open quick tour' }));
    expect(screen.getByRole('heading', { name: 'Choose your workspace' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Back', exact: true })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next', exact: true }));
    expect(screen.getByRole('heading', { name: 'Build and run a lab' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open Cyber Lab' })).toHaveAttribute('href', '/labs');
    fireEvent.click(screen.getByRole('button', { name: 'Close tour', exact: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open quick tour' }));
    expect(screen.getByRole('heading', { name: 'Build and run a lab' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true }));
    expect(screen.getByRole('heading', { name: 'Choose your workspace' })).toBeVisible();
  });

  it('recovers from invalid saved progress and can finish and replay the tour', () => {
    window.localStorage.setItem('oxsig:quick-tour:v1', '999');
    render(<WorkspaceWalkthrough />);
    fireEvent.click(screen.getByRole('button', { name: 'Open quick tour' }));
    expect(screen.getByRole('heading', { name: 'Choose your workspace' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Step 6: Ask for help in context' }));
    expect(screen.getByRole('heading', { name: 'Ask for help in context' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Finish tour', exact: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open quick tour' }));
    expect(screen.getByRole('heading', { name: 'Choose your workspace' })).toBeVisible();
  });
});
