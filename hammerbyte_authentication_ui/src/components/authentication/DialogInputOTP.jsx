import { Dialog } from "primereact/dialog";
import { InputOtp } from "primereact/inputotp";
import { useInterval, useUpdateEffect } from "primereact/hooks";
import { useMemo, useState } from "react";
import { Button } from "primereact/button";
import Blocker from "../common/Blocker";
import passwordImage from "../../assets/icons/password.png";
import iconLoading from "../../assets/icons/loading.gif";
import iconError from "../../assets/icons/error.gif";
import { useAppContext } from "../app/Wrapper";
import { KEY_AUTHENTICATION_TOKEN } from "../../../constants";

export default function DialogInputOTP({
	authenticationToken,
	setAuthenticationToken,
	email,
	onAuthenticated,
}) {
	const { requestAPI, showToast } = useAppContext();

	const [otp, setOTP] = useState("");
	const [blocker, setBlocker] = useState();
	const resendInterval = useMemo(() => 60, []);
	const [waitSeconds, setWaitSeconds] = useState(resendInterval);

	useInterval(() => setWaitSeconds((prev) => prev - 1), 1000, waitSeconds > 0);

	const setRequestBlocker = (isLoading, title, message) =>
		setBlocker((prev) =>
			isLoading
				? {
						icon: iconLoading,
						title,
						message,
					}
				: prev?.icon === iconLoading
					? undefined
					: prev,
		);

	function validateOTP() {
		requestAPI({
			requestPath: "authentication-tokens",
			requestMethod: "PATCH",
			onRequestFailure: (requestError) =>
				setBlocker({
					icon: iconError,
					title: "Validation Failed",
					message: requestError ?? "Failed To Validate OTP!",
				}),
			onRequestStart: () => setBlocker(undefined),
			setLoading: (isLoading) =>
				setRequestBlocker(isLoading, "Validating OTP", "Verifying your one-time password..."),
			requestPostBody: {
				otp,
				authentication_token: authenticationToken,
			},
			onResponseReceieved: ({ error: responseError, ...user }, responseCode) => {
				if (user?.id && responseCode === 200) {
					localStorage.setItem(KEY_AUTHENTICATION_TOKEN, authenticationToken);
					onAuthenticated?.(user);
				} else {
					setBlocker({
						icon: iconError,
						title: "Invalid OTP",
						message: responseError || "Invalid OTP",
					});
				}
			},
		});
	}

	useUpdateEffect(() => {
		if (otp?.length === 4) {
			validateOTP();
		}
	}, [otp]);

	function reGenerateOTP() {
		requestAPI({
			requestPath: "authentication-tokens",
			requestMethod: "POST",
			onRequestFailure: (requestError) =>
				setBlocker({
					icon: iconError,
					title: "Resend Failed",
					message: requestError ?? "Failed To Request OTP!",
				}),
			onRequestStart: () => setBlocker(undefined),
			setLoading: (isLoading) =>
				setRequestBlocker(isLoading, "Resending OTP", "Requesting a new authentication token..."),
			requestPostBody: { email },
			onResponseReceieved: ({ error: responseError, authentication_token }, responseCode) => {
				if (responseCode === 201 && authentication_token) {
					setAuthenticationToken(authentication_token);
					setOTP("");
					setWaitSeconds(resendInterval);
					showToast({
						severity: "success",
						summary: "OTP",
						detail: "OTP Resent Successfully!",
						life: 1200,
					});
				} else {
					setBlocker({
						icon: iconError,
						title: "Resend Failed",
						message: responseError || "Failed To ReGenerate OTP, Try Again Later!",
					});
				}
			},
		});
	}

	const isLoading = blocker?.icon === iconLoading;

	const footer = (
		<div className="flex justify-content-end">
			<Button
				onClick={reGenerateOTP}
				icon="pi pi-clock"
				label={waitSeconds ? `Resend OTP in ${waitSeconds} Seconds` : "Resend OTP"}
				disabled={waitSeconds > 0 || isLoading}
			/>
		</div>
	);

	return (
		<Dialog
			header="Verify OTP"
			visible={Boolean(authenticationToken)}
			onHide={() => setAuthenticationToken("")}
			className="w-6"
			position="bottom"
			pt={{
				content: { className: "overflow-visible" },
			}}
			footer={isLoading ? null : footer}
		>
			{blocker ? (
				<div className="h-12rem">
					<Blocker {...blocker} />
				</div>
			) : (
				<div className="flex flex-column align-items-center">
					<img
						src={passwordImage}
						alt="password"
						className="mb-3 w-full max-w-7rem h-auto block mx-auto"
						decoding="async"
					/>

					<span className="m-0 mb-2">Enter The OTP Sent To You...</span>

					<InputOtp
						length={4}
						value={otp}
						integerOnly
						mask
						onChange={(event) => setOTP(event.value)}
					/>
				</div>
			)}
		</Dialog>
	);
}
