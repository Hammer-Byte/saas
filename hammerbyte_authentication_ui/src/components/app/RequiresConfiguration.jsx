import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useAppContext } from "./Wrapper";
import { setConfigs } from "../../redux/sliceConfigs";
import iconError from "../../assets/icons/error.gif";
import iconLoading from "../../assets/icons/loading.gif";
import iconMaintenance from "../../assets/icons/maintenance.gif";

export default function RequiresConfiguration({ children }) {
	const { requestAPI, setAppBlocker } = useAppContext();
	const configs = useSelector((state) => state.stateConfigs);
	const dispatch = useDispatch();

	const [loading, setLoading] = useState(false);
	const [error, setError] = useState();

	if (!configs && !loading && !error) {
		requestAPI({
			requestPath: "configs",
			setLoading: (isLoading) => {
				setLoading(!!isLoading);
				setAppBlocker((prev) =>
					isLoading
						? {
								icon: iconLoading,
								title: "Configuring",
								message: "Loading Application Configuration...",
							}
						: prev?.icon === iconLoading
							? undefined
							: prev,
				);
			},
			onRequestFailure: (requestError) => {
				const blocker = {
					icon: iconError,
					title: "No Application Configuration",
					message: `Unable To Load Application Configuration - ${requestError}`,
				};
				setError(blocker);
				setAppBlocker(blocker);
			},
			onResponseReceieved: (responseConfigs, responseCode) => {
				if (responseConfigs && responseCode === 200) {
					if (responseConfigs?.maintenance) {
						const blocker = {
							icon: iconMaintenance,
							title: "Under Maintenance",
							message:
								"The application is currently under maintenance. Please try again later.",
						};
						setError(blocker);
						return setAppBlocker(blocker);
					}
					return dispatch(setConfigs(responseConfigs));
				}
				const blocker = {
					icon: iconError,
					title: "No Application Configuration",
					message: "Invalid Application Configuration Received",
				};
				setError(blocker);
				return setAppBlocker(blocker);
			},
		});
	}

	if (configs) {
		return children;
	}
}
