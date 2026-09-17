import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

/**
 * Protects a worksheet so that column headers (Row 1) cannot be edited,
 * while keeping data cells (Row 2+) unlocked for user editing.
 * 
 * @param {object} worksheet - SheetJS worksheet object
 * @returns {object} The protected worksheet
 */
export function protectWorksheetHeaders(worksheet) {
    if (!worksheet || !worksheet['!ref']) return worksheet;

    worksheet['!protect'] = {
        password: '',
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: true,
        formatColumns: true,
        formatRows: true,
        insertRows: true,
        deleteRows: true,
        sort: true,
        autoFilter: true
    };

    return worksheet;
}

/**
 * Exports a workbook with Row 1 (Headers) locked and Row 2+ (Data cells) explicitly UNLOCKED,
 * allowing users to freely edit data cells in Excel while preserving header protection.
 * 
 * @param {object} sheetjsWorkbook - SheetJS workbook object containing worksheets
 * @param {string} fileName - File name for the download (.xlsx)
 */
export async function exportProtectedWorkbook(sheetjsWorkbook, fileName) {
    const excelWorkbook = new ExcelJS.Workbook();

    sheetjsWorkbook.SheetNames.forEach((sheetName) => {
        const sheetjsWorksheet = sheetjsWorkbook.Sheets[sheetName];
        if (!sheetjsWorksheet || !sheetjsWorksheet['!ref']) return;

        const excelWorksheet = excelWorkbook.addWorksheet(sheetName);
        const range = XLSX.utils.decode_range(sheetjsWorksheet['!ref']);

        // Transfer column widths if defined
        if (sheetjsWorksheet['!cols'] && Array.isArray(sheetjsWorksheet['!cols'])) {
            excelWorksheet.columns = sheetjsWorksheet['!cols'].map((col) => ({
                width: col.wch || 15
            }));
        }

        // Copy cells & set protection: Row 1 (Header) locked, Row 2+ (Data) unlocked
        for (let R = range.s.r; R <= range.e.r; ++R) {
            const rowValues = [];
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
                const cell = sheetjsWorksheet[cellRef];
                rowValues[C + 1] = cell && cell.v !== undefined ? cell.v : '';
            }

            const excelRow = excelWorksheet.getRow(R + 1);
            excelRow.values = rowValues;

            const isHeader = (R === 0);
            excelRow.eachCell({ includeEmpty: true }, (cell) => {
                cell.protection = { locked: isHeader };
            });
        }

        // Enable sheet protection with empty password
        excelWorksheet.protect('', {
            selectLockedCells: true,
            selectUnlockedCells: true,
            formatCells: true,
            formatColumns: true,
            formatRows: true,
            insertRows: true,
            deleteRows: true,
            sort: true,
            autoFilter: true
        });
    });

    // Write file buffer and trigger download in browser
    const buffer = await excelWorkbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

