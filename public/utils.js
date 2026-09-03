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
        const format = element.dataset.dateFormat || "YYYY-MM-DD HH:mm:ss";
        element.textContent = getReadableDate(format, element.dataset.readableDate) || "-";
    });
})();
