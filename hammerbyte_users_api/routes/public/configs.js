import { getConfigs } from "../../services/configs.js";

export default function configs(app) {
	return app.get("/", getConfigs, {
		detail: {
			tags: ["Configs"],
			summary: "Get application configs",
			description:
				"Returns CONFIGS as a key/value object. Boolean-like values such as maintenance are coerced.",
		},
	});
}
