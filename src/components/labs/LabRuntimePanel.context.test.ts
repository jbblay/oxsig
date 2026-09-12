import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/labs/LabRuntimePanel.tsx'), 'utf8');

describe('LabRuntimePanel machine/session context', () => {
  it('routes the active session back to its live machine inspector', () => {
    const handlerStart = source.indexOf('const showLiveMachineInspector = () => {');
    const handlerEnd = source.indexOf('\n  };', handlerStart);
    const handler = source.slice(handlerStart, handlerEnd);

    expect(handlerStart).toBeGreaterThan(-1);
    expect(handler).toContain('if (!liveNode) return;');
    expect(handler).toContain('setSelectedNodeId(liveNode.id);');
    expect(handler).toContain('setInspectorOpen(true);');
    expect(handler).toContain('setTopologyOpen(true);');
    expect(handler).toContain('setCompactPanel("inspector");');
    expect(handler).toContain('setDockFocus(false);');
    expect(source).toContain('onClick={showLiveMachineInspector}');
    expect(source).toContain('aria-label={`Show Inspector actions for ${liveNodeLabel}`}');
    expect(source).toContain('Session · {liveNodeLabel}');
  });

  it('keeps closing session views separate from machine lifecycle actions', () => {
    const label = 'aria-label={`Close session views for ${liveNodeLabel}. Machine keeps running.`}';
    const labelIndex = source.indexOf(label);
    const closeControl = source.slice(Math.max(0, labelIndex - 260), labelIndex + 260);

    expect(labelIndex).toBeGreaterThan(-1);
    expect(closeControl).toContain('setTerminalId(null);');
    expect(closeControl).toContain('setDesktopId(null);');
    expect(closeControl).toContain('setDockOpen(false);');
    expect(closeControl).toContain('Close views');
    expect(closeControl).not.toContain('act(instance.id');
  });
});
