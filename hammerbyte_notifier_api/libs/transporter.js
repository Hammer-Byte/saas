import { createTransport } from "nodemailer";

const { logger } = require("@hammerbyte/utils");

const smtp = {
	host: Bun.env.SMTP_HOST,
	port: Number(Bun.env.SMTP_PORT),
	secure: false,
	auth: {
		user: Bun.env.SMTP_EMAIL,
		pass: Bun.env.SMTP_PASSWORD,
	},
	tls: {
		rejectUnauthorized: false,
	},
};

let transporter;

export async function initTransporter() {
	if (!smtp.host || !smtp.auth.user || !smtp.auth.pass || !smtp.port) {
		throw new Error("SMTP is not configured");
	}

	const created = createTransport(smtp);
	await created.verify();
	transporter = created;
}

export async function transportEmail({
	recipients,
	ccs = [],
	bccs = [],
	subject,
	html,
	attachments = [],
}) {
	if (!transporter) {
		throw new Error("SMTP transporter is not initialized");
	}

	const info = await transporter.sendMail({
		from: smtp.auth.user,
		to: recipients.join(", "),
		cc: ccs.length ? ccs.join(", ") : undefined,
		bcc: bccs.length ? bccs.join(", ") : undefined,
		subject,
		html,
		attachments: attachments.map((attachment) => ({
			filename: attachment.name,
			path: attachment.file,
		})),
	});

	logger.success(`Email Sent -> ${recipients.join(", ")}`);
	return info;
}
