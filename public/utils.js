(() => {
    const DATE_TOKENS = /YYYY|MM|DD|HH|mm|ss/g;

    function parseToDate(date) {
        if (date == null || date === "") {
            return null;
        }

        if (date instanceof Date) {
            return Number.isNaN(date.getTime()) ? null : date;
        }

        const value = String(date).trim();
        const dateTimeMatch = value.match(
            /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/,
        );
        if (dateTimeMatch) {
            return new Date(
                Number(dateTimeMatch[1]),
                Number(dateTimeMatch[2]) - 1,
                Number(dateTimeMatch[3]),
                Number(dateTimeMatch[4] || 0),
                Number(dateTimeMatch[5] || 0),
                Number(dateTimeMatch[6] || 0),
            );
        }

        const monthMatch = value.match(/^(\d{4})-(\d{2})$/);
        if (monthMatch) {
            return new Date(Number(monthMatch[1]), Number(monthMatch[2]) - 1, 1);
        }

        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function formatDate(format, date) {
        const parsed = parseToDate(date);
        if (!parsed) {
            return "";
        }

        const parts = {
            YYYY: String(parsed.getFullYear()),
            MM: `${parsed.getMonth() + 1}`.padStart(2, "0"),
            DD: `${parsed.getDate()}`.padStart(2, "0"),
            HH: `${parsed.getHours()}`.padStart(2, "0"),
            mm: `${parsed.getMinutes()}`.padStart(2, "0"),
            ss: `${parsed.getSeconds()}`.padStart(2, "0"),
        };

        return format.replace(DATE_TOKENS, (token) => parts[token]);
    }

    /** Format a date for API / DB write (`YYYY-MM-DD HH:mm:ss`, `YYYY-MM`, …). */
    window.getWritableDate = function getWritableDate(format, date) {
        return formatDate(format, date);
    };

    /** Format a date from API / DB for UI display or inputs. */
    window.getReadableDate = function getReadableDate(format, date) {
        return formatDate(format, date);
    };

    document.querySelectorAll("[data-readable-date]").forEach((element) => {
        const format = element.dataset.dateFormat || "YYYY-MM-DD HH:mm:ss";
        element.textContent = getReadableDate(format, element.dataset.readableDate) || "-";
    });
})();
