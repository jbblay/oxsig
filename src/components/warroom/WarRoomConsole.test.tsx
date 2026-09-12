import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WarRoomConsole } from './WarRoomConsole';
import { RuntimeProgress } from './RuntimeProgress';

const closed = vi.hoisted(() => vi.fn());
vi.mock('next/dynamic', () => ({ default: (loader: () => Promise<unknown>) => {
  const desktop = String(loader).includes('InteractiveSsmDesktop');
  return function Transport({ machineLabel }: { machineLabel: string }) {
    React.useEffect(() => () => closed(machineLabel), [machineLabel]);
    return <div>{desktop ? 'Desktop session' : 'Terminal session'}: {machineLabel}</div>;
  };
}}));
vi.mock('@/components/live-workspace/ControlLeasePanel', () => ({ ControlLeasePanel: ({ resources }: { resources: Array<{label: string}> }) => <div>Shared control: {resources[0].label}</div> }));
const nodes = [
  {id:'operator',key:'operator',label:'Operator',role:'operator',osFamily:'ubuntu',status:'running',privateIp:'10.0.0.1',labInstanceId:'lab1'},
  {id:'windows',key:'windows',label:'Windows',role:'target',osFamily:'windows',status:'running',privateIp:'10.0.0.2',labInstanceId:null},
];
const props = {
  runId:'run1',nodes,status:'running',paused:false,isOwner:true,selectedResourceId:null,onNodeChange:vi.fn(),
  workspaceId:'workspace1',viewerId:'owner',capabilities:{observe:true,requestControl:true,grantControl:true,eligibleForTerminalControl:true,eligibleForDesktopControl:true},
  resources:[],control:{requests:[],leases:[],note:''},onRefresh:async()=>{},
};
afterEach(() => { cleanup(); closed.mockClear(); });
describe('WarRoom machine navigation', () => {
  it('keeps visited transports mounted while switching machines and Windows surfaces', () => {
    render(<WarRoomConsole {...props} />);
    fireEvent.click(screen.getByRole('tab',{name:'Operator'}));
    expect(screen.getByText('Terminal session: Operator')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab',{name:'Windows'}));
    expect(closed).not.toHaveBeenCalled();
    expect(screen.getByText('Terminal session: Windows')).toBeTruthy();

    fireEvent.click(screen.getByRole('button',{name:'Desktop'}));
    expect(closed).not.toHaveBeenCalled();
    expect(screen.getByText('Desktop session: Windows')).toBeTruthy();

    fireEvent.click(screen.getByRole('button',{name:'Terminal'}));
    fireEvent.click(screen.getByRole('tab',{name:'Operator'}));
    expect(closed).not.toHaveBeenCalled();
    expect(screen.getByText('Terminal session: Operator')).toBeTruthy();
  });

  it('preserves the selected machine and mounted transport during polling refreshes', () => {
    const view=render(<WarRoomConsole {...props} />);
    fireEvent.click(screen.getByRole('tab',{name:'Windows'}));
    expect(screen.getByText('Terminal session: Windows')).toBeTruthy();

    view.rerender(<WarRoomConsole {...props} nodes={nodes.map(node=>({...node}))} />);

    expect(screen.getByRole('tab',{name:'Windows'}).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Terminal session: Windows')).toBeTruthy();
    expect(closed).not.toHaveBeenCalled();
  });

  it('keeps owner-only transport unavailable to teammates', () => {
    render(<WarRoomConsole {...props} isOwner={false} />);
    fireEvent.click(screen.getByRole('tab',{name:'Windows'}));
    expect(screen.queryByText('Terminal session: Windows')).toBeNull();
    expect(screen.queryByRole('button',{name:'Desktop'})).toBeNull();
  });

  it('uses shared control for an attached operator instead of owner transport', async () => {
    render(<WarRoomConsole {...props} selectedResourceId="binding1" resources={[{id:'binding1',type:'lab-instance',resourceId:'lab1',label:'Team operator',accessMode:'terminal'}]} />);
    await waitFor(()=>expect(screen.getByText('Shared control: Team operator')).toBeTruthy());
    expect(screen.queryByText('Terminal session: Operator')).toBeNull();
  });

  it('supports keyboard machine selection and closes mounted transports when paused', () => {
    const view=render(<WarRoomConsole {...props} />);
    fireEvent.keyDown(screen.getByRole('tab',{name:'Operator'}),{key:'End'});
    expect(screen.getByRole('tab',{name:'Windows'}).getAttribute('aria-selected')).toBe('true');

    view.rerender(<WarRoomConsole {...props} paused />);

    expect(closed).toHaveBeenCalledWith('Operator');
    expect(closed).toHaveBeenCalledWith('Windows');
    expect(screen.getAllByText('Resume the environment to connect.')).toHaveLength(2);
  });
});
describe('Reported provisioning progress', () => {
  it('counts only verified nodes and makes unfinished node progress indeterminate', () => {
    render(<RuntimeProgress nodes={[nodes[0],{...nodes[1],status:'provisioning',computeStatus:'running'}]} status="provisioning" />);
    expect(screen.getByRole('progressbar',{name:'Machines verified ready'}).getAttribute('value')).toBe('1');
    expect(screen.getByRole('progressbar',{name:'Windows: Guest setup'}).hasAttribute('aria-valuenow')).toBe(false);
  });
  it('does not report paused machines as ready', () => {
    render(<RuntimeProgress nodes={nodes} status="running" paused />);
    expect(screen.getByRole('progressbar',{name:'Machines verified ready'}).getAttribute('value')).toBe('0');
  });
});
