import React, { useState } from 'react';
import Modal from './Modal';
import { Calendar, Download, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRESET_OPTIONS = [
    { id: 'today', label: 'Today', description: '00:00 to 23:59 today' },
    { id: 'yesterday', label: 'Yesterday', description: 'Previous full day' },
    { id: 'last_7_days', label: 'Last 7 Days', description: 'Past week activity' },
    { id: 'last_30_days', label: 'Last 30 Days', description: 'Past month activity' },
    { id: 'custom', label: 'Custom Date', description: 'Pick specific range' },
    { id: 'till_now', label: 'Till Now / All Time', description: 'Complete history from start' },
];

const ExportDateModal = ({
    isOpen,
    onClose,
    onConfirmExport,
    title = 'Export Excel Report',
    isExporting = false
}) => {
    const [selectedPreset, setSelectedPreset] = useState('till_now');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');

    const handleConfirm = () => {
        onConfirmExport({
            preset: selectedPreset,
            customFrom: selectedPreset === 'custom' ? customFrom : null,
            customTo: selectedPreset === 'custom' ? customTo : null,
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
            <div className="space-y-6 p-2">
                <div className="flex items-center gap-3 p-4 bg-emerald-50 ring-1 ring-emerald-100 rounded-2xl">
                    <div className="p-2.5 bg-emerald-500 text-white rounded-xl shadow-md">
                        <Download className="h-5 w-5" />
                    </div>
                    <div>
                        <h4 className="text-sm font-black text-slate-900">Select Export Date Range</h4>
                        <p className="text-xs font-bold text-slate-500">Choose a time window to filter your Excel report records.</p>
                    </div>
                </div>

                {/* Presets Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {PRESET_OPTIONS.map((opt) => {
                        const isSelected = selectedPreset === opt.id;
                        return (
                            <button
                                key={opt.id}
                                type="button"
                                onClick={() => setSelectedPreset(opt.id)}
                                className={cn(
                                    "flex flex-col p-3 rounded-2xl border text-left transition-all relative overflow-hidden",
                                    isSelected
                                        ? "border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20 shadow-sm"
                                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                                )}
                            >
                                <span className={cn(
                                    "text-xs font-black",
                                    isSelected ? "text-emerald-700" : "text-slate-900"
                                )}>
                                    {opt.label}
                                </span>
                                <span className="text-[10px] font-medium text-slate-400 mt-1 line-clamp-1">
                                    {opt.description}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Custom Date Pickers */}
                {selectedPreset === 'custom' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-2xl ring-1 ring-slate-200/80 animate-in fade-in duration-300">
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1 flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5 text-emerald-600" /> Start Date
                            </label>
                            <input
                                type="date"
                                value={customFrom}
                                onChange={(e) => setCustomFrom(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/20"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1 flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5 text-emerald-600" /> End Date
                            </label>
                            <input
                                type="date"
                                value={customTo}
                                onChange={(e) => setCustomTo(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/20"
                            />
                        </div>
                    </div>
                )}

                {/* Modal Footer Actions */}
                <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isExporting}
                        className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-emerald-700 active:scale-95 transition-all shadow-md shadow-emerald-200 disabled:opacity-50"
                    >
                        <Download className="h-4 w-4" />
                        {isExporting ? 'Generating Excel...' : 'Confirm & Download Excel'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default ExportDateModal;
