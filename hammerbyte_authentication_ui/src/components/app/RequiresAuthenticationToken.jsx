import { Navigate, Outlet } from "react-router-dom";
import { KEY_AUTHENTICATION_TOKEN } from "../../../constants";

export default function RequiresAuthenticationToken() {
	const token = localStorage.getItem(KEY_AUTHENTICATION_TOKEN);
	return token ? <Outlet /> : <Navigate to="/" replace />;
}
