/**
 * Date Filter Utilities for Admin Excel Exports
 */

export function getDateRangeBounds(preset = 'till_now', customFromDate = null, customToDate = null) {
    const now = new Date();
    let fromDate = null;
    let toDate = null;

    switch (preset) {
        case 'today': {
            const start = new Date(now);
            start.setHours(0, 0, 0, 0);
            const end = new Date(now);
            end.setHours(23, 59, 59, 999);
            fromDate = start;
            toDate = end;
            break;
        }
        case 'yesterday': {
            const start = new Date(now);
            start.setDate(start.getDate() - 1);
            start.setHours(0, 0, 0, 0);
            const end = new Date(now);
            end.setDate(end.getDate() - 1);
            end.setHours(23, 59, 59, 999);
            fromDate = start;
            toDate = end;
            break;
        }
        case 'last_7_days': {
            const start = new Date(now);
            start.setDate(start.getDate() - 6);
            start.setHours(0, 0, 0, 0);
            const end = new Date(now);
            end.setHours(23, 59, 59, 999);
            fromDate = start;
            toDate = end;
            break;
        }
        case 'last_30_days': {
            const start = new Date(now);
            start.setDate(start.getDate() - 29);
            start.setHours(0, 0, 0, 0);
            const end = new Date(now);
            end.setHours(23, 59, 59, 999);
            fromDate = start;
            toDate = end;
            break;
        }
        case 'custom': {
            if (customFromDate) {
                const start = new Date(customFromDate);
                start.setHours(0, 0, 0, 0);
                fromDate = start;
            }
            if (customToDate) {
                const end = new Date(customToDate);
                end.setHours(23, 59, 59, 999);
                toDate = end;
            }
            break;
        }
        case 'till_now':
        case 'all':
        default: {
            fromDate = null;
            toDate = null;
            break;
        }
    }

    return { fromDate, toDate };
}

export function filterRecordsByDateRange(items = [], preset = 'till_now', customFrom = null, customTo = null, dateFieldKeys = ['createdAt', 'createdDate', 'date', 'joinedDate']) {
    if (!Array.isArray(items) || items.length === 0) return [];
    if (preset === 'till_now' || preset === 'all') return items;

    const { fromDate, toDate } = getDateRangeBounds(preset, customFrom, customTo);
    if (!fromDate && !toDate) return items;

    return items.filter((item) => {
        if (!item) return false;

        let rawDate = null;
        for (const key of dateFieldKeys) {
            if (item[key]) {
                rawDate = item[key];
                break;
            }
        }

        if (!rawDate) return true; // Keep if no date field present

        const itemDate = new Date(rawDate);
        if (isNaN(itemDate.getTime())) return true;

        if (fromDate && itemDate < fromDate) return false;
        if (toDate && itemDate > toDate) return false;

        return true;
    });
}
