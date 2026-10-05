export default function health(app) {
	return app.get("/", () => ({ ok: true }), {
		detail: {
			tags: ["Health"],
			summary: "Health check",
			description: "Public liveness probe for the roles microservice.",
		},
	});
}
