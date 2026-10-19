import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "primereact/resources/themes/soho-light/theme.css";
import "primeicons/primeicons.css";
import "primeflex/primeflex.css";
import "primereact/resources/primereact.css";
import "./index.css";
import App from "./components/App";

const rootElement = document.getElementById("root");
const app = (
	<StrictMode>
		<App />
	</StrictMode>
);

if (import.meta.hot) {
	const root = (import.meta.hot.data.root ??= createRoot(rootElement));
	root.render(app);
} else {
	createRoot(rootElement).render(app);
}
