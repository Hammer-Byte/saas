import { BrowserRouter, Route, Routes } from "react-router-dom";
import Authentication from "../containers/Authentication";
import RequiresAuthenticationToken from "./RequiresAuthenticationToken";

export default function AppRoutes() {
	return (
		<BrowserRouter>
			<Routes>
				<Route path="/" element={<Authentication />} />
				<Route element={<RequiresAuthenticationToken />}>
					{/* private routes */}
				</Route>
			</Routes>
		</BrowserRouter>
	);
}
