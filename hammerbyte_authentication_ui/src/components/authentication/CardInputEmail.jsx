import { useState } from "react";
import { Button } from "primereact/button";
import { Card } from "primereact/card";
import emailImage from "../../assets/icons/email.png";
import FloatLabelInputText from "../common/inputs/FloatLabelInputText";
import { useAppContext } from "../app/Wrapper";

export default function CardInputEmail({ setAuthenticationToken, setEmail }) {
	const { requestAPI, showToast } = useAppContext();

	const [email, setLocalEmail] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	const generateOTP = () => {
		const trimmedEmail = email.trim().toLowerCase();
		if (!trimmedEmail.includes("@")) {
			setError("Enter a valid email!");
			return;
		}

		requestAPI({
			requestPath: "authentication-tokens",
			requestMethod: "POST",
			onRequestFailure: (requestError) =>
				showToast({
					severity: "error",
					summary: "OTP",
					detail: requestError ?? "Failed To Request OTP!",
					life: 3000,
				}),
			onRequestStart: setError,
			setLoading,
			requestPostBody: { email: trimmedEmail },
			onResponseReceieved: ({ error = "Failed To Generate OTP, Try Again Later!", authentication_token }, responseCode) => {
				if (responseCode === 201 && authentication_token) {
					setEmail(trimmedEmail);
					setAuthenticationToken(authentication_token);
					showToast({
						severity: "success",
						summary: "OTP",
						detail: "OTP Sent Successfully!",
						life: 1200,
					});
				} else {
					showToast({
						severity: "error",
						summary: "OTP",
						detail: error,
						life: 3000,
					});
				}
			},
		});
	};

	return (
		<Card className="w-11 sm:w-9 md:w-7 lg:w-5 xl:w-4 shadow-2 border-round-xl">
			<div className="flex flex-column align-items-center text-center">
				<h2 className="m-0">HammerByte</h2>
				<h3 className="m-2">Login</h3>

				<img
					src={emailImage}
					alt="email"
					className="mb-3 w-full max-w-7rem h-auto block mx-auto"
					decoding="async"
				/>

				<FloatLabelInputText
					id="email"
					label="Email"
					icon="pi pi-envelope"
					autoFocus
					type="email"
					disabled={loading}
					value={email}
					onChange={(event) => setLocalEmail(event.target.value?.trim() || "")}
					invalid={!!error}
					error={error}
				/>

				<Button
					onClick={generateOTP}
					className="w-full mt-3"
					label="Send OTP"
					loading={loading}
					icon="pi pi-arrow-right"
					iconPos="right"
				/>
			</div>
		</Card>
	);
}
