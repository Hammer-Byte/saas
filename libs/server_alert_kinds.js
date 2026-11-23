/** Shared labels for alert log kinds. */

export const SERVER_ALERT_KIND_LABELS = {
    pinger_missed: "Pinger — missed ping",
    metricer_ram: "Metricer — RAM",
    metricer_cpu: "Metricer — CPU",
    metricer_storage: "Metricer — Storage",
    metricer_temp: "Metricer — Temperature",
    dataer_result: "Dataer — sync result",
    dber_result: "DBer — sync result",
};

export function serverAlertKindLabel(kind) {
    return SERVER_ALERT_KIND_LABELS[kind] || String(kind || "Alert");
}
