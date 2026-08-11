import { createMail } from "../db/mails.js";
import transporter from "../libs/transporter.js";

export async function sendMail({ application, body, set }) {
    transporter.transport(body);
    createMail({ ...body, application_service_id: application.service.id });
    set.status = 201;
}
