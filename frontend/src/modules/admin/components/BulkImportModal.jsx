import React, { useState } from 'react';
import Modal from '@shared/components/ui/Modal';
import { adminApi } from '../services/adminApi';
import { toast } from 'sonner';
import { HiOutlineDocumentArrowUp, HiOutlineArrowPath } from 'react-icons/hi2';

const BulkImportModal = ({ isOpen, onClose, onSuccess }) => {
    const [file, setFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [report, setReport] = useState(null);
    const [progress, setProgress] = useState(null);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setReport(null);
            setProgress(null);
        }
    };

    const handleDownloadTemplate = async () => {
        setIsDownloading(true);
        try {
            const response = await adminApi.downloadImportTemplate();
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'catalog_import_template.xlsx');
            document.body.appendChild(link);
            link.click();
            link.remove();
            toast.success('Template download started');
        } catch (error) {
            toast.error('Failed to download template');
        } finally {
            setIsDownloading(false);
        }
    };

    const handleUpload = async () => {
        if (!file) return toast.error('Please select an Excel file');

        setIsUploading(true);
        setProgress({ processed: 0, total: 0, status: 'PENDING', success: 0, skipped: 0, failed: 0 });
        const formData = new FormData();
        formData.append('excelFile', file);

        try {
            const response = await adminApi.bulkImportCatalog(formData);
            if (response.data.success) {
                const taskId = response.data.taskId;
                
                const interval = setInterval(async () => {
                    try {
                        const statusRes = await adminApi.getImportStatus(taskId);
                        if (statusRes.data.success) {
                            const task = statusRes.data.task;
                            setProgress(task);
                            
                            if (task.status === 'COMPLETED' || task.status === 'FAILED') {
                                clearInterval(interval);
                                setIsUploading(false);
                                setReport({
                                    total: task.total,
                                    success: task.success,
                                    skipped: task.skipped,
                                    failed: task.failed,
                                    errors: task.errors
                                });
                                setProgress(null);
                                setFile(null);
                                toast.success(task.status === 'COMPLETED' ? 'Bulk import completed!' : 'Bulk import failed');
                                if (onSuccess) onSuccess();
                            }
                        }
                    } catch (pollErr) {
                        console.error('Polling error:', pollErr);
                    }
                }, 2000);
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to import products');
            setIsUploading(false);
            setProgress(null);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Bulk Import Catalog" size="md">
            <div className="p-6 space-y-4">
                {!report ? (
                    <>
                        <div className="flex justify-between items-center bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-2">
                            <div className="min-w-0 flex-1 pr-3">
                                <h4 className="text-xs font-bold text-emerald-800">Need a template?</h4>
                                <p className="text-[10px] text-emerald-600 font-medium">Download the standard layout, fill it, and upload below.</p>
                            </div>
                            <button 
                                onClick={handleDownloadTemplate}
                                disabled={isDownloading || isUploading}
                                className="px-3 py-1.5 shrink-0 bg-emerald-600 text-white rounded-lg text-[10px] font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1 transition-all"
                            >
                                {isDownloading && <HiOutlineArrowPath className="animate-spin h-3 w-3" />}
                                DOWNLOAD TEMPLATE
                            </button>
                        </div>

                        {progress ? (
                            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 text-center space-y-4">
                                <HiOutlineArrowPath className="animate-spin h-10 w-10 text-slate-600 mx-auto" />
                                <div>
                                    <h4 className="text-sm font-bold text-slate-800">Processing Catalog Import</h4>
                                    <p className="text-xs text-slate-500 mt-1">Please wait while products are being imported dynamically.</p>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                                    <div 
                                        className="bg-slate-900 h-2.5 rounded-full transition-all duration-500" 
                                        style={{ width: `${progress.total > 0 ? (progress.processed / progress.total) * 100 : 0}%` }}
                                    />
                                </div>
                                <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    <span>Processed: {progress.processed} / {progress.total}</span>
                                    <span className="text-slate-900">
                                        {progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0}%
                                    </span>
                                </div>
                                <div className="flex justify-center gap-4 text-xs font-bold pt-2">
                                    <span className="text-emerald-600">Success: {progress.success}</span>
                                    <span className="text-amber-600">Skipped: {progress.skipped}</span>
                                    <span className="text-rose-600">Failed: {progress.failed}</span>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 transition-colors relative">
                                    <input 
                                        type="file" 
                                        accept=".xlsx, .xls" 
                                        onChange={handleFileChange} 
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                    <HiOutlineDocumentArrowUp className="h-12 w-12 text-slate-300 mb-3" />
                                    <h3 className="text-sm font-bold text-slate-700">
                                        {file ? file.name : 'Upload Excel File'}
                                    </h3>
                                    <p className="text-xs text-slate-400 mt-1">
                                        {file ? 'Ready to upload' : 'Drag and drop or click to browse'}
                                    </p>
                                </div>
                                <div className="flex justify-end gap-3 mt-4">
                                    <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700">CANCEL</button>
                                    <button 
                                        onClick={handleUpload} 
                                        disabled={isUploading || !file}
                                        className="px-6 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-md hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-400 disabled:opacity-50 flex items-center gap-2 transition-all"
                                    >
                                        {isUploading && <HiOutlineArrowPath className="animate-spin h-4 w-4" />}
                                        {isUploading ? 'IMPORTING...' : 'START IMPORT'}
                                    </button>
                                </div>
                            </>
                        )}
                    </>
                ) : (
                    <div className="space-y-4">
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-center">
                            <h3 className="text-lg font-black text-slate-800">Import Complete!</h3>
                            <p className="text-sm text-slate-500 mt-1">Processed {report.total} products</p>
                            
                            <div className="flex justify-center gap-6 mt-4">
                                <div className="text-center">
                                    <p className="text-2xl font-black text-emerald-500">{report.success}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Success</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-2xl font-black text-amber-500">{report.skipped || 0}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Skipped</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-2xl font-black text-rose-500">{report.failed}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Failed</p>
                                </div>
                            </div>
                        </div>

                        {report.errors && report.errors.length > 0 && (
                            <div className="bg-rose-50 rounded-xl p-4 border border-rose-100 max-h-48 overflow-y-auto text-xs text-rose-600">
                                <p className="font-bold mb-2 uppercase tracking-widest text-[10px]">Errors Log ({report.errors.length})</p>
                                <div className="space-y-2">
                                    {report.errors.map((err, i) => (
                                        <div key={i} className="flex flex-col border-b border-rose-100/50 pb-1.5 last:border-0 last:pb-0">
                                            <span className="font-bold text-[10px] uppercase text-rose-700">Row {err.row} | Col: {err.col}</span>
                                            <span className="text-slate-600 font-medium">{err.message}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end mt-4">
                            <button 
                                onClick={onClose}
                                className="px-6 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-md hover:-translate-y-0.5 transition-all"
                            >
                                CLOSE
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default BulkImportModal;
