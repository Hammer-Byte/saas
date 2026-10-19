import { useState } from "react";
import CardInputEmail from "../authentication/CardInputEmail";
import Hero from "../authentication/Hero";
import DialogInputOTP from "../authentication/DialogInputOTP";
import lowPolyGrid from "../../assets/backgrounds/low_poly_grid.svg";

export default function Authentication() {
	const [authenticationToken, setAuthenticationToken] = useState("");
	const [email, setEmail] = useState("");

	return (
		<div
			className="min-h-screen flex flex-row relative bg-cover bg-center bg-no-repeat"
			style={{ backgroundImage: `url(${lowPolyGrid})`, backgroundAttachment: "fixed" }}
		>
			<Hero />

			<div
				className="flex-1 flex flex-column align-items-center justify-content-center p-4 relative"
				style={{ backdropFilter: "blur(8px)" }}
			>
				<CardInputEmail
					setAuthenticationToken={setAuthenticationToken}
					setEmail={setEmail}
				/>
				<DialogInputOTP
					authenticationToken={authenticationToken}
					setAuthenticationToken={setAuthenticationToken}
					email={email}
				/>
				<p className="mt-4 mb-0 text-sm text-gray-600">Copyright © HammerByte</p>
			</div>
		</div>
	);
}
