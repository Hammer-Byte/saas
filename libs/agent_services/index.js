import monitor from "./monitor.js";
import drivesync from "./drivesync.js";
import { describeFields } from "./common.js";

/**
 * Registry of services the HammerByte Agent can run.
 * Adding a service: create a module here + agents/services/<id>.ps1 and list it in build-agents.
 */
const SERVICES = [monitor, drivesync];

const BY_ID = new Map(SERVICES.map((service) => [service.id, service]));

export function listAgentServices() {
    return SERVICES;
}

export function getAgentService(id) {
    return BY_ID.get(String(id || "").toLowerCase()) || null;
}

export function getDefaultConfig(id) {
    const service = getAgentService(id);
    return service ? structuredClone(service.defaults) : null;
}

export function describeAgentServices() {
    return SERVICES.map((service) => ({
        id: service.id,
        label: service.label,
        description: service.description,
        fields: describeFields(service.fields),
    }));
}
