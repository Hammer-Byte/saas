(() => {
    const DATE_TOKENS = /YYYY|MM|DD|HH|mm|ss/g;
    const CONFIRM_MODAL_ID = "app-confirm-modal";

    function matchWallClock(value) {
        const trimmed = String(value ?? "").trim();
        const dateTimeMatch = trimmed.match(
            /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/,
        );
        if (dateTimeMatch) {
            return {
                YYYY: dateTimeMatch[1],
                MM: dateTimeMatch[2],
                DD: dateTimeMatch[3],
                HH: (dateTimeMatch[4] || "00").padStart(2, "0"),
                mm: (dateTimeMatch[5] || "00").padStart(2, "0"),
                ss: (dateTimeMatch[6] || "00").padStart(2, "0"),
            };
        }

        const monthMatch = trimmed.match(/^(\d{4})-(\d{2})$/);
        if (monthMatch) {
            return {
                YYYY: monthMatch[1],
                MM: monthMatch[2],
                DD: "01",
                HH: "00",
                mm: "00",
                ss: "00",
            };
        }

        // Indian wall-clock: DD/MM/YYYY or DD-MM-YYYY[ HH:mm[:ss]]
        const dayFirstMatch = trimmed.match(
            /^(\d{2})[/-](\d{2})[/-](\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
        );
        if (dayFirstMatch) {
            return {
                YYYY: dayFirstMatch[3],
                MM: dayFirstMatch[2],
                DD: dayFirstMatch[1],
                HH: (dayFirstMatch[4] || "00").padStart(2, "0"),
                mm: (dayFirstMatch[5] || "00").padStart(2, "0"),
                ss: (dayFirstMatch[6] || "00").padStart(2, "0"),
            };
        }

        return null;
    }

    function formatParts(format, parts) {
        return format.replace(DATE_TOKENS, (token) => parts[token]);
    }

    function parseToDate(date) {
        if (date == null || date === "") {
            return null;
        }

        if (date instanceof Date) {
            return Number.isNaN(date.getTime()) ? null : date;
        }

        const wallClock = matchWallClock(date);
        if (wallClock) {
            return new Date(
                Number(wallClock.YYYY),
                Number(wallClock.MM) - 1,
                Number(wallClock.DD),
                Number(wallClock.HH),
                Number(wallClock.mm),
                Number(wallClock.ss),
            );
        }

        const parsed = new Date(String(date).trim());
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function formatDate(format, date) {
        if (date == null || date === "") {
            return "";
        }

        // Keep YYYY-MM-DD[ HH:mm:ss] / datetime-local strings timezone-safe.
        if (typeof date === "string" || typeof date === "number") {
            const wallClock = matchWallClock(date);
            if (wallClock) {
                return formatParts(format, wallClock);
            }
        }

        const parsed = parseToDate(date);
        if (!parsed) {
            return "";
        }

        return formatParts(format, {
            YYYY: String(parsed.getFullYear()),
            MM: `${parsed.getMonth() + 1}`.padStart(2, "0"),
            DD: `${parsed.getDate()}`.padStart(2, "0"),
            HH: `${parsed.getHours()}`.padStart(2, "0"),
            mm: `${parsed.getMinutes()}`.padStart(2, "0"),
            ss: `${parsed.getSeconds()}`.padStart(2, "0"),
        });
    }

    window.getWritableDate = function getWritableDate(format, date) {
        return formatDate(format, date);
    };

    window.getReadableDate = function getReadableDate(format, date) {
        return formatDate(format, date);
    };

    function getConfirmModalElement() {
        let modalElement = document.getElementById(CONFIRM_MODAL_ID);
        if (modalElement) {
            return modalElement;
        }

        modalElement = document.createElement("div");
        modalElement.id = CONFIRM_MODAL_ID;
        modalElement.className = "modal fade";
        modalElement.tabIndex = -1;
        modalElement.setAttribute("aria-hidden", "true");
        modalElement.dataset.bsBackdrop = "static";
        modalElement.dataset.bsKeyboard = "false";
        modalElement.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" data-confirm-title></h5>
                    </div>
                    <div class="modal-body">
                        <p class="mb-0" data-confirm-description></p>
                    </div>
                    <div class="modal-footer" data-confirm-choices></div>
                </div>
            </div>
        `;
        document.body.appendChild(modalElement);
        return modalElement;
    }

    window.showConfirm = function showConfirm({ title, description, choices }) {
        return new Promise((resolve) => {
            if (!window.bootstrap?.Modal) {
                resolve(window.confirm([title, description].filter(Boolean).join("\n\n")));
                return;
            }

            const modalElement = getConfirmModalElement();
            const titleElement = modalElement.querySelector("[data-confirm-title]");
            const descriptionElement = modalElement.querySelector("[data-confirm-description]");
            const choicesElement = modalElement.querySelector("[data-confirm-choices]");
            const modal = window.bootstrap.Modal.getOrCreateInstance(modalElement);

            titleElement.textContent = title || "";
            descriptionElement.textContent = description || "";
            choicesElement.replaceChildren();

            let settled = false;

            function finish(value) {
                if (settled) {
                    return;
                }
                settled = true;
                modal.hide();
                resolve(value);
            }

            for (const choice of choices || []) {
                const button = document.createElement("button");
                button.type = "button";
                button.className = `btn btn-${choice.variant || "secondary"}`;
                button.textContent = choice.label;
                button.addEventListener("click", () => finish(choice.value));
                choicesElement.appendChild(button);
            }

            const onHidden = () => {
                modalElement.removeEventListener("hidden.bs.modal", onHidden);
                if (!settled) {
                    settled = true;
                    resolve(null);
                }
            };

            modalElement.addEventListener("hidden.bs.modal", onHidden);
            modal.show();
        });
    };

    document.querySelectorAll("[data-readable-date]").forEach((element) => {
        const format = element.dataset.dateFormat || "DD/MM/YYYY HH:mm:ss";
        element.textContent = getReadableDate(format, element.dataset.readableDate) || "-";
    });

    function hydrateDateLikeInput(element, displayFormat) {
        const raw = element.dataset.dateValue || element.value;
        const display = getReadableDate(displayFormat, raw);
        if (display) {
            element.value = display;
        }

        element.addEventListener("blur", () => {
            const normalizedDisplay = getReadableDate(displayFormat, element.value);
            if (normalizedDisplay) {
                element.value = normalizedDisplay;
            }
        });

        const form = element.closest("form");
        if (!form || form.dataset.dateNormalizeBound === "1") {
            return;
        }
        form.dataset.dateNormalizeBound = "1";
        form.addEventListener("submit", () => {
            form.querySelectorAll(".js-date-input").forEach((input) => {
                const iso = getWritableDate("YYYY-MM-DD", input.value);
                if (iso) input.value = iso;
            });
            form.querySelectorAll(".js-datetime-input").forEach((input) => {
                const iso = getWritableDate("YYYY-MM-DD HH:mm:ss", input.value);
                if (iso) input.value = iso;
            });
        });
    }

    document.querySelectorAll(".js-date-input").forEach((element) => {
        hydrateDateLikeInput(element, "DD/MM/YYYY");
    });

    document.querySelectorAll(".js-datetime-input").forEach((element) => {
        hydrateDateLikeInput(element, "DD/MM/YYYY HH:mm");
    });

    window.hasRequiredAuthority = function hasRequiredAuthority(requiredAuthority) {
        const authorities = Array.isArray(window.__AUTHORITIES__) ? window.__AUTHORITIES__ : [];
        return authorities.includes(requiredAuthority);
    };

    function formatLocalDateKey(date) {
        return [
            date.getFullYear(),
            `${date.getMonth() + 1}`.padStart(2, "0"),
            `${date.getDate()}`.padStart(2, "0"),
        ].join("-");
    }

    /** Monday YYYY-MM-DD for the week containing value. Weeks are Mon–Sun. */
    window.getMondayDate = function getMondayDate(value) {
        const source = value ?? new Date();
        const dateKey =
            typeof source === "string" || typeof source === "number"
                ? getWritableDate("YYYY-MM-DD", source)
                : formatLocalDateKey(source instanceof Date ? source : new Date());
        if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
            return null;
        }
        const year = Number(dateKey.slice(0, 4));
        const month = Number(dateKey.slice(5, 7));
        const day = Number(dateKey.slice(8, 10));
        const date = new Date(year, month - 1, day);
        const weekday = date.getDay();
        const offset = weekday === 0 ? -6 : 1 - weekday;
        date.setDate(date.getDate() + offset);
        return formatLocalDateKey(date);
    };

    window.getSundayDate = function getSundayDate(mondayValue) {
        const mondayKey = window.getMondayDate(mondayValue);
        if (!mondayKey) {
            return null;
        }
        const year = Number(mondayKey.slice(0, 4));
        const month = Number(mondayKey.slice(5, 7));
        const day = Number(mondayKey.slice(8, 10));
        const date = new Date(year, month - 1, day);
        date.setDate(date.getDate() + 6);
        return formatLocalDateKey(date);
    };
})();
