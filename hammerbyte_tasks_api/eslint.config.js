import js from "@eslint/js";
import { importX } from "eslint-plugin-import-x";
import globals from "globals";
import lints from "@hammerbyte/lints";

/** @type {import("eslint").Linter.Config[]} */
export default [
	{
		ignores: ["node_modules/**"],
	},
	js.configs.recommended,
	importX.flatConfigs.recommended,
	{
		files: ["**/*.{js,mjs,cjs}"],
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: {
				...globals.node,
				...globals.bunBuiltin,
			},
		},
		plugins: {
			lints,
		},
		settings: {
			"import-x/resolver": {
				node: {
					extensions: [".js", ".mjs", ".cjs", ".json"],
				},
			},
			"import-x/core-modules": ["bun"],
		},
		rules: {
			...lints.configs.api.rules,
			// Tasks-only phase: other hammerbyte_* packages stay empty — re-enable when scaffolding them
			"lints/basic-microservices": "off",
			// Predefined import-x extras (do not re-implement under lints/)
			"import-x/no-duplicates": "error",
			"import-x/newline-after-import": "error",
			"import-x/no-self-import": "error",
			"import-x/no-useless-path-segments": "error",
			// Dual named+default export required by lints/routes + default import by lints/server
			"import-x/no-named-as-default": "off",
			// Use @hammerbyte/utils logger — not console.*
			"no-console": "error",
			// Single-expression arrow bodies must be concise: () => value
			"arrow-body-style": ["error", "as-needed"],
			// Allow !!value (preferred presence check)
			"no-extra-boolean-cast": "off",
			"no-eq-null": "error",
			"no-restricted-syntax": [
				"error",
				{
					selector: "ReturnStatement[argument.type='Literal'][argument.raw='null']",
					message: "Do not return null; return a meaningful value or omit the return.",
				},
				{
					selector: "ReturnStatement[argument.type='Identifier'][argument.name='undefined']",
					message: "Do not return undefined explicitly; return a meaningful value or omit the return.",
				},
				{
					selector:
						"BinaryExpression[operator=/^[!=]==?$/][right.type='Literal'][right.raw='null']",
					message: "Do not compare to null; use !!value.",
				},
				{
					selector:
						"BinaryExpression[operator=/^[!=]==?$/][left.type='Literal'][left.raw='null']",
					message: "Do not compare to null; use !!value.",
				},
				{
					selector:
						"BinaryExpression[operator=/^[!=]==?$/][right.type='Identifier'][right.name='undefined']",
					message: "Do not compare to undefined; use !!value.",
				},
				{
					selector:
						"BinaryExpression[operator=/^[!=]==?$/][left.type='Identifier'][left.name='undefined']",
					message: "Do not compare to undefined; use !!value.",
				},
				{
					selector:
						"BinaryExpression[operator=/^[!=]==$/][left.type='UnaryExpression'][left.operator='typeof'][right.type='Literal'][right.value='undefined']",
					message: "Do not use typeof … === \"undefined\"; use !!value.",
				},
				{
					selector:
						"BinaryExpression[operator=/^[!=]==$/][right.type='UnaryExpression'][right.operator='typeof'][left.type='Literal'][left.value='undefined']",
					message: "Do not use typeof … === \"undefined\"; use !!value.",
				},
			],
		},
	},
];
