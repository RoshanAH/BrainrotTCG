import { useEffect, useId, useRef, useState } from 'react';
import { Download, History, Upload } from 'lucide-react';
import { STORAGE_KEYS } from '../../constants';
import { MAX_NAME_LENGTH } from '../../engine';
import { exportPlayer, getPlayer, renamePlayer } from '../../game/player';
import { canBringOldSave, fetchOldSave, importSave, type MoveResult } from '../../game/move';
import type { Settings } from '../../types';
import Sheet from '../ui/Sheet';
import '../../styles/Settings.css';
import { CURRENT_DATA_VERSION } from '../../utils/migrations';

interface SettingsPageProps {
    settings: Settings;
    onSettingsChange: (settings: Settings) => void;
    onClose: () => void;
    onImportSave: (data: string) => void;
}

const SettingsPage = ({ settings, onSettingsChange, onClose, onImportSave }: SettingsPageProps) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [player, setPlayer] = useState(getPlayer);
    const [nameDraft, setNameDraft] = useState(player.name);

    const saveName = () => {
        const updated = renamePlayer(nameDraft);
        setPlayer(updated);
        setNameDraft(updated.name);
    };

    const handleExportSave = () => {
        const saveData = {
            collection: localStorage.getItem(STORAGE_KEYS.COLLECTION),
            achievements: localStorage.getItem(STORAGE_KEYS.ACHIEVEMENTS),
            stats: localStorage.getItem(STORAGE_KEYS.STATS),
            hallOfFame: localStorage.getItem(STORAGE_KEYS.HALL_OF_FAME),
            settings: localStorage.getItem(STORAGE_KEYS.SETTINGS),
            history: localStorage.getItem(STORAGE_KEYS.HISTORY),
            // Your secret player key: it's what makes your pulls yours. Don't share this file.
            player: exportPlayer(),
            exportedAt: new Date().toISOString(),
            version: 2,
            // Shape of the stored data, so importing an older save runs the migrations it needs.
            dataVersion: CURRENT_DATA_VERSION,
        };

        const blob = new Blob([JSON.stringify(saveData, null, 2)], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `brainrot-tcg-save-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // After the site moved: fetch the save from the old address (game/move.ts). Replacing a different
    // save here is asked in this row, not in a browser dialog, which can open behind the old address's
    // window.
    const [oldSaveNote, setOldSaveNote] = useState('Played at the old address? Bring that save here.');
    const [oldSave, setOldSave] = useState<{ save: unknown } | null>(null);
    const keepRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (oldSave) keepRef.current?.focus();
    }, [oldSave]);
    const showBringResult = (result: MoveResult) => {
        setOldSave(null);
        if (result === 'saved') return window.location.reload();
        setOldSaveNote(
            result === 'same' ? 'Your save from the old address is already here.'
            : result === 'kept' ? 'Kept the save you have here.'
            : "That didn't look like a save, so nothing changed.",
        );
    };
    const handleBringOldSave = async () => {
        setOldSaveNote('Opening the old address…');
        const got = await fetchOldSave();
        if (got === 'blocked') return setOldSaveNote('Your browser blocked the window. Allow pop-ups for this site, then try again.');
        if (got === 'none') return setOldSaveNote('There was no save at the old address.');
        if (got === 'timeout') return setOldSaveNote("The old address didn't answer, so nothing changed. Try again.");
        // Don't replace a different save yet: ask first.
        const result = importSave(got.save, () => false);
        if (result !== 'kept') return showBringResult(result);
        setOldSave(got);
        setOldSaveNote('This browser has a different save. Replace it with the old one? The one here is kept as a backup.');
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            onImportSave(content);
        };
        reader.readAsText(file);

        // Reset input so the same file can be selected again
        e.target.value = '';
    };

    return (
        <Sheet title="Settings" onClose={onClose} size="sm" className="settings">
            <section className="settings-group">
                <h3 className="section-title" id="settings-player">Player</h3>
                <div className="settings-panel">
                    <label className="settings-field">
                        <span className="settings-label">Name</span>
                        <input
                            className="settings-input"
                            value={nameDraft}
                            onChange={(e) => setNameDraft(Array.from(e.target.value).slice(0, MAX_NAME_LENGTH).join(''))}
                            onBlur={saveName}
                            onKeyDown={(e) => e.key === 'Enter' && saveName()}
                            autoComplete="nickname"
                            spellCheck={false}
                        />
                        <span className="settings-desc">
                            Shown on pulls you share, next to your ID <span className="share-fp">#{player.fingerprint}</span>.
                        </span>
                    </label>
                </div>
            </section>

            <section className="settings-group">
                <h3 className="section-title">Experience</h3>
                <div className="settings-panel">
                    <SwitchRow
                        label="Sound"
                        desc="Music, card sounds and effects"
                        checked={settings.soundEnabled}
                        onChange={() => onSettingsChange({ ...settings, soundEnabled: !settings.soundEnabled })}
                    />
                    <SwitchRow
                        label="Particles"
                        desc="Sparks and confetti"
                        checked={settings.particlesEnabled}
                        onChange={() => onSettingsChange({ ...settings, particlesEnabled: !settings.particlesEnabled })}
                    />
                    <SwitchRow
                        label="Preview upcoming sets"
                        desc="Sets still waiting for their final art"
                        checked={!!settings.showDraftSets}
                        onChange={() => onSettingsChange({ ...settings, showDraftSets: !settings.showDraftSets })}
                    />
                </div>
            </section>

            <section className="settings-group">
                <h3 className="section-title">Save data</h3>
                <div className="settings-panel">
                    <div className="settings-row">
                        <span className="settings-text">
                            <span className="settings-label">Back up</span>
                            <span className="settings-desc">Includes your secret player key. Keep the file private.</span>
                        </span>
                        <button type="button" className="btn btn--secondary btn--sm" onClick={handleExportSave}>
                            <Download aria-hidden="true" /> Export
                        </button>
                    </div>
                    <div className="settings-row">
                        <span className="settings-text">
                            <span className="settings-label">Restore</span>
                            <span className="settings-desc">Load a backup file</span>
                        </span>
                        <button type="button" className="btn btn--secondary btn--sm" onClick={handleImportClick}>
                            <Upload aria-hidden="true" /> Import
                        </button>
                        <input ref={fileInputRef} type="file" accept=".txt,.json" onChange={handleFileChange} hidden />
                    </div>
                    {canBringOldSave() && (
                        <div className={oldSave ? 'settings-row settings-row--wrap' : 'settings-row'}>
                            <span className="settings-text">
                                <span className="settings-label">From the old address</span>
                                <span className="settings-desc" role="status">{oldSaveNote}</span>
                            </span>
                            {oldSave ? (
                                <span className="settings-actions">
                                    <button type="button" ref={keepRef} className="btn btn--secondary btn--sm" onClick={() => showBringResult('kept')}>
                                        Keep mine
                                    </button>
                                    <button type="button" className="btn btn--primary btn--sm" onClick={() => showBringResult(importSave(oldSave.save, () => true))}>
                                        Replace
                                    </button>
                                </span>
                            ) : (
                                <button type="button" className="btn btn--secondary btn--sm" onClick={handleBringOldSave}>
                                    <History aria-hidden="true" /> Bring it
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </section>
        </Sheet>
    );
};

const SwitchRow = ({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: () => void }) => {
    const id = useId();
    return (
        <div className="settings-row">
            <span className="settings-text">
                <span className="settings-label" id={`${id}-label`}>{label}</span>
                <span className="settings-desc" id={`${id}-desc`}>{desc}</span>
            </span>
            <button
                type="button"
                role="switch"
                className="switch"
                aria-checked={checked}
                aria-labelledby={`${id}-label`}
                aria-describedby={`${id}-desc`}
                onClick={onChange}
            />
        </div>
    );
};

export default SettingsPage;
