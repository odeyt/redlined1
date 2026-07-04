'use client';

import { useAppState, useAppDispatch } from '@/lib/store';
import { Panel } from '@/components/Panel';
import { StatCard } from '@/components/StatCard';
import { Badge } from '@/components/Badge';
import { connectScanTool, readTroubleCodes } from '@/services/scanToolService';
import { lookupDtc } from '@/services/dtcLookupService';

export function DiagnosticsView() {
  const { scanStatus, diagnosticCodes } = useAppState();
  const dispatch = useAppDispatch();
  const connected = scanStatus === 'Connected';

  const liveData: [string, string][] = connected
    ? [['RPM', '742'], ['Coolant', '188 F'], ['Battery', '14.1V'], ['Intake Air', '82 F'], ['Speed', '0 mph'], ['Fuel Trim', '+2.4%']]
    : [['RPM', '--'], ['Coolant', '--'], ['Battery', '--'], ['Intake Air', '--'], ['Speed', '--'], ['Fuel Trim', '--']];

  function handleConnect() {
    dispatch({ type: 'SET_SCAN_STATUS', status: 'Connecting' });
    setTimeout(() => {
      const result = connectScanTool();
      dispatch({ type: 'SET_SCAN_STATUS', status: result.status });
      dispatch({ type: 'NOTIFY', message: `Scan tool ${result.status.toLowerCase()}. Protocol: ${result.protocol}` });
    }, 550);
  }

  return (
    <>
      <Panel title="Scan Tool Session" hint="Simulated browser UI for a future OBD-II, Bluetooth, J2534, or backend diagnostic bridge">
        <div className="actions" style={{ justifyContent: 'flex-start', marginBottom: 14 }}>
          <button className="btn primary" onClick={handleConnect}>Connect scan tool</button>
          <button className="btn" onClick={() => dispatch({ type: 'READ_CODES', codes: readTroubleCodes() })}>Read trouble codes</button>
          <button className="btn" onClick={() => dispatch({ type: 'CLEAR_CODES' })}>Clear codes</button>
          <button className="btn success" onClick={() => dispatch({ type: 'SAVE_DIAGNOSTIC' })}>Save report to job card</button>
          <Badge text={scanStatus} />
        </div>
        <div className="grid cols-3">
          <StatCard label="Vehicle detected" value={connected ? '2020 BMW 330i' : 'Waiting'} subtext={connected ? 'VIN WBA5R1C05LFH11223' : 'No scan tool connected'} />
          <StatCard label="Protocol" value={connected ? 'ISO 15765-4 CAN' : '--'} subtext="OBD-II" />
          <StatCard label="Linked Job Card" value="JC-3110" subtext="Diagnostic report source" />
        </div>
      </Panel>

      <div className="diagnostic-grid">
        {liveData.map(([label, value]) => (
          <div key={label} className="data-card">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <div className="split">
        <Panel title="Trouble Codes" hint="Read from simulated scan tool">
          {diagnosticCodes.length ? (
            <table>
              <thead>
                <tr><th>Code</th><th>Category</th><th>Description</th><th>Severity</th></tr>
              </thead>
              <tbody>
                {diagnosticCodes.map(code => {
                  const item = lookupDtc(code);
                  if (!item) return <tr key={code}><td colSpan={4}>{code} — not in database</td></tr>;
                  return (
                    <tr key={code}>
                      <td>{item.code}</td>
                      <td>{item.category}</td>
                      <td>{item.description}</td>
                      <td><Badge text={item.severity} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="empty-note">Connect scan tool and read codes to populate diagnostic results.</div>
          )}
        </Panel>

        <Panel title="Freeze Frame Data" hint="Captured context for technician review">
          <table>
            <thead>
              <tr><th>Parameter</th><th>Value</th></tr>
            </thead>
            <tbody>
              {[
                ['Engine RPM', '2,410'],
                ['Vehicle speed', '47 mph'],
                ['Coolant temp', '191 F'],
                ['Calculated load', '42%'],
                ['Short term fuel trim', '+3.1%'],
              ].map(([param, val], i) => (
                <tr key={i}><td>{param}</td><td>{val}</td></tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}
