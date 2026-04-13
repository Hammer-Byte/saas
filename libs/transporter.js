import { logger } from "@hammerbyte/utils";
import nodemailer from "nodemailer";

class Transporter {

    constructor() {
        if (Transporter.instance) {
            return Transporter.instance;
        }

        this.smtp = {
            host: Bun.env.SMTP_HOST,
            port: Number(Bun.env.SMTP_PORT),
            secure: false,
            auth: { user: Bun.env.SMTP_EMAIL, pass: Bun.env.SMTP_PASSWORD },
            tls: {
                rejectUnauthorized: false, // Allows for non-validated SSL certificates (for development purposes)
            },
        }

        Transporter.instance = this;
    }

    async init() {
        if (!this.smtp.host || !this.smtp.auth.user || !this.smtp.auth.pass || !this.smtp.port) {
            throw new Error("SMTP is not configured");
        }
        const transporter = nodemailer.createTransport(this.smtp);
        await transporter.verify();
        this.transporter = transporter;
    }

    transport({ recipient, subject, body, html_enabled = false } = {}) {
        this.transporter.sendMail({
            from: this.smtp.auth.user,
            to:recipient,
            subject,
            ...(html_enabled ? { html: body } : { text: body }),
        }, (error, info) => {
            if (error) 
                logger.error(error)
             else 
                logger.success(`Email Sent -> ${recipient}`);
            
        });
    }
}

const transporterInstance = new Transporter();
export default transporterInstance;

