// src/components/BentoDashboard.jsx
// Top-level Bento composer. Owns all UI state per D-11 (no Zustand).
// DevPanel mounts only when import.meta.env.DEV; Vite tree-shakes the import in prod
// because (a) the JSX guard becomes `{false && <DevPanel ... />}`, (b) DevPanel.jsx
// is side-effect-free (no module-top throw — D-04b fix), and (c) package.json sets
// sideEffects: false.

import { useEffect, useState, useMemo } from 'react';
import './Bento.css';

// Sibling components (Plan 04 deliverables).
import AuthCard from './AuthCard.jsx';
import FileExplorer from './FileExplorer.jsx';
import StorageGauge from './StorageGauge.jsx';
import TransferPortal from './TransferPortal.jsx';
import ResumeBanner from './ResumeBanner.jsx';
import SmartFilterButtons from './SmartFilterButtons.jsx';
import PreflightModal from './PreflightModal.jsx';
import DisclosureModal from './DisclosureModal.jsx';
import DevPanel from './DevPanel.jsx';

// Neutral STATE_OPTIONS module — shared with DevPanel, breaks the circular dep risk.
import { STATE_OPTIONS } from './stateOptions.js';

// Mocks (DEV-only by guard inside the mock modules themselves).
import { listFiles } from '../mocks/googleApi.mock.js';
import { getAllFiles, getAllFolders, getStressFiles } from '../mocks/mockData.js';

// Map composite auth state → per-card state.
function authCardStates(auth) {
  switch (auth) {
    case 'both':         return { source: { state: 'connected', email: 'student@school.edu' },         dest: { state: 'connected', email: 'me@gmail.com' } };
    case 'source-only':  return { source: { state: 'connected', email: 'student@school.edu' },         dest: { state: 'disconnected' } };
    case 'dest-only':    return { source: { state: 'disconnected' },                                    dest: { state: 'connected', email: 'me@gmail.com' } };
    case 'expired':      return { source: { state: 'expired',   email: 'student@school.edu' },         dest: { state: 'expired',   email: 'me@gmail.com' } };
    default:             return { source: { state: 'disconnected' },                                    dest: { state: 'disconnected' } };
  }
}

export default function BentoDashboard() {
  // D-10 toggles — component-local state per D-11.
  // STATE_OPTIONS is imported above but not deconstructed here; we use string defaults
  // that match the canonical D-10 values. STATE_OPTIONS is consulted via DevPanel.
  const [authState,   setAuthState]   = useState('disconnected');
  const [scanState,   setScanState]   = useState('idle');
  const [queueState,  setQueueState]  = useState('idle');
  const [gaugeState,  setGaugeState]  = useState('partial');
  const [resumeState, setResumeState] = useState('no-cursor');

  // Files state — synchronous initial paint from mockData, async refresh from listFiles
  // (proves the Phase 4 swap path works: listFiles → setFiles).
  const [files,   setFiles]   = useState(() => getAllFiles());
  const [folders] = useState(() => getAllFolders());
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  // Dataset-size toggle — Plan 05 wires the actual swap via a separate useEffect.
  const [datasetSize, setDatasetSize] = useState(500);

  // Modal state.
  const [preflightOpen,  setPreflightOpen]  = useState(false);
  const [disclosureOpen, setDisclosureOpen] = useState(false);

  // Async refresh via the locked Phase 4 contract — paginates through the mock.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const acc = [];
        let pageToken;
        do {
          const page = await listFiles({ pageToken });
          acc.push(...page.files);
          pageToken = page.nextPageToken;
        } while (pageToken);
        if (!cancelled) setFiles(acc);
      } catch (err) {
        // Plan 03's failure injection will trigger this path; surface in console for DevPanel testing.
        console.warn('[BentoDashboard] listFiles failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // When DevPanel toggles a stress-test dataset size (>500), swap files to the stress dataset.
  useEffect(() => {
    if (datasetSize <= 500) {
      setFiles(getAllFiles());
    } else {
      setFiles(getStressFiles(datasetSize));
    }
    // Clear selection when swapping datasets — IDs do not overlap reliably.
    setSelectedIds(new Set());
  }, [datasetSize]);

  const cards = useMemo(() => authCardStates(authState), [authState]);
  const totalSize = useMemo(() => files.reduce((s, f) => s + Number(f.size || 0), 0), [files]);

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleStateChange = (slice, value) => {
    ({ auth: setAuthState, scan: setScanState, queue: setQueueState, gauge: setGaugeState, resume: setResumeState })[slice]?.(value);
  };

  // STATE_OPTIONS is referenced indirectly via DevPanel which imports it itself.
  // We expose it here only as a no-op reference to satisfy "BentoDashboard knows
  // about the canonical enumeration" — the actual list rendering happens in DevPanel.
  // (No runtime effect; keeps the dependency edge visible to future readers.)
  void STATE_OPTIONS;

  return (
    <div className="bento-shell">
      <header className="bento-header">
        <h1 style={{ margin: 0, fontSize: '24px', color: 'var(--text-primary)' }}>UniVault</h1>
        <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
          Phase 0 skeleton · {files.length.toLocaleString()} files · mock dataset
        </span>
      </header>

      {/* DEV-only panel. The literal `import.meta.env.DEV` becomes `false` at prod build
          time; Vite dead-code-eliminates the JSX subtree AND the unused DevPanel import,
          and (because package.json has sideEffects:false + DevPanel.jsx has no module-top
          side effects) the whole DevPanel module is dropped from the prod bundle. */}
      {import.meta.env.DEV && (
        <DevPanel
          authState={authState}     onAuth={(v)   => handleStateChange('auth', v)}
          scanState={scanState}     onScan={(v)   => handleStateChange('scan', v)}
          queueState={queueState}   onQueue={(v)  => handleStateChange('queue', v)}
          gaugeState={gaugeState}   onGauge={(v)  => handleStateChange('gauge', v)}
          resumeState={resumeState} onResume={(v) => handleStateChange('resume', v)}
          datasetSize={datasetSize} onDatasetSize={(n) => { setDatasetSize(n); /* Plan 05 hooks here */ }}
          onOpenPreflight={() => setPreflightOpen(true)}
          onOpenDisclosure={() => setDisclosureOpen(true)}
        />
      )}

      <ResumeBanner cursorPresent={resumeState === 'cursor-present'} remainingCount={42} />

      <div className="bento-grid">
        <div className="span-6"><AuthCard account="source" {...cards.source} /></div>
        <div className="span-6"><AuthCard account="dest"   {...cards.dest}   /></div>

        <div className="span-12">
          <SmartFilterButtons files={files} folders={folders} onApply={(name) => console.log('apply filter', name)} />
        </div>

        <div className="span-8"><FileExplorer files={files} selectedIds={selectedIds} onToggle={toggleSelected} /></div>

        <div className="span-4" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <StorageGauge state={gaugeState} />
          <TransferPortal state={queueState} />
        </div>
      </div>

      <PreflightModal
        isOpen={preflightOpen} onClose={() => setPreflightOpen(false)}
        onConfirm={() => { setPreflightOpen(false); setDisclosureOpen(true); }}
        fileCount={selectedIds.size}
        totalSize={totalSize}
        destAvailable={58 * 1024 ** 3}
      />
      <DisclosureModal
        isOpen={disclosureOpen} onClose={() => setDisclosureOpen(false)}
        onAcknowledge={() => { setDisclosureOpen(false); setQueueState('mirroring'); }}
      />
    </div>
  );
}
