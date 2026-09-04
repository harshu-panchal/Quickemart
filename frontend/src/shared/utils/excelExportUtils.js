import * as XLSX from 'xlsx';

/**
 * Protects a worksheet so that column headers (Row 1) cannot be edited,
 * while keeping data cells (Row 2+) unlocked for user editing.
 * 
 * @param {object} worksheet - SheetJS worksheet object
 * @returns {object} The protected worksheet
 */
export function protectWorksheetHeaders(worksheet) {
    if (!worksheet || !worksheet['!ref']) return worksheet;

    // Enable sheet protection metadata in SheetJS
    worksheet['!protect'] = {
        password: '', // Empty password enables sheet protection without prompting for password to unprotect
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

    const range = XLSX.utils.decode_range(worksheet['!ref']);

    // Lock header cells (Row 1: r = 0)
    for (let C = range.s.c; C <= range.e.c; ++C) {
        const headerRef = XLSX.utils.encode_cell({ r: 0, c: C });
        if (worksheet[headerRef]) {
            worksheet[headerRef].s = {
                ...(worksheet[headerRef].s || {}),
                protection: { locked: true }
            };
        }
    }

    // Unlock data cells (Row 2 onwards: r >= 1)
    for (let R = 1; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
            if (worksheet[cellRef]) {
                worksheet[cellRef].s = {
                    ...(worksheet[cellRef].s || {}),
                    protection: { locked: false }
                };
            }
        }
    }

    return worksheet;
}
