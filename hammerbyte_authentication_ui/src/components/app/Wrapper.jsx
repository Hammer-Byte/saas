import { PrimeReactProvider } from "primereact/api";
import { Toast } from "primereact/toast";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { KEY_AUTHENTICATION_TOKEN } from "../../../constants";
import Blocker from "../common/Blocker";

const ContextApp = createContext();

export function Wrapper({ children }) {
	const toastRef = useRef(null);
	const [appBlocker, setAppBlocker] = useState();

	const showToast = (config) => {
		toastRef.current?.show(config);
		if (config?.severity === "error") {
			console.error(config);
		}
	};

	const requestAPI = useCallback(async function ({
		requestHeaders = {},
		requestService = process.env.BUN_PUBLIC_API_HOST,
		requestPath = "",
		requestMethod = "GET",
		requestGetQuery = false,
		requestPostBody = false,
		onRequestStart = false,
		setLoading = false,
		onResponseReceieved = false,
		parseResponseBody = true,
		onRequestFailure = false,
		onRequestEnd = false,
	} = {}) {
		if (onRequestStart) onRequestStart();
		if (setLoading) setLoading(true);

		const service = String(requestService || "").replace(/\/+$/, "");
		const path = String(requestPath || "").replace(/^\/+/, "");
		let finalRequestPath = path ? `${service}/${path}` : service;

		if (requestGetQuery) {
			const searchParams = new URLSearchParams();
			Object.keys(requestGetQuery).forEach((key) => {
				const value = requestGetQuery[key];
				if (Array.isArray(value)) {
					value.forEach((item) => searchParams.append(key, item));
				} else {
					searchParams.append(key, value);
				}
			});
			finalRequestPath = `${finalRequestPath}?${searchParams.toString()}`;
		}

		const fetchOptions = {
			headers: {
				"Content-Type": "application/json",
				...(localStorage.getItem(KEY_AUTHENTICATION_TOKEN) && {
					[KEY_AUTHENTICATION_TOKEN]: localStorage.getItem(KEY_AUTHENTICATION_TOKEN),
				}),
				...requestHeaders,
			},
			method: requestMethod.toUpperCase(),
		};

		if (requestPostBody) {
			fetchOptions.body =
				requestPostBody instanceof FormData
					? requestPostBody
					: JSON.stringify(requestPostBody);
		}

		try {
			const response = await fetch(finalRequestPath, fetchOptions);
			const parsedResponse = parseResponseBody ? await response.json() : response;

			if (onResponseReceieved) onResponseReceieved(parsedResponse, response.status);
		} catch (error) {
			if (onRequestFailure) onRequestFailure(String(error));
		} finally {
			if (setLoading) setLoading(false);
			if (onRequestEnd) onRequestEnd();
		}
	}, []);

	return (
		<PrimeReactProvider value={{ ripple: true, appendTo: "self" }}>
			<div className="h-screen surface-ground overflow-hidden relative">
				<ContextApp.Provider
					value={{
						showToast,
						requestAPI,
						setAppBlocker,
					}}
				>
					<Toast ref={toastRef} position="top-center" />
					{appBlocker ? <Blocker {...appBlocker} /> : children}
				</ContextApp.Provider>
			</div>
		</PrimeReactProvider>
	);
}

export const useAppContext = () => useContext(ContextApp);
