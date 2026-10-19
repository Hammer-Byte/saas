import emailImage from "../../assets/icons/email.png";

export default function Hero() {
	return (
		<div className="w-4 my-1 relative overflow-hidden border-round-right-3xl border-1 border-gray-800 shadow-8 bg-primary-900 hidden md:flex">
			<div className="absolute top-0 left-0 w-full h-full bg-primary-900 opacity-70" />
			<div className="relative z-1 flex flex-column justify-content-between text-white p-4 sm:p-5 w-full h-full">
				<div>
					<span className="text-2xl font-bold">welcome to</span>
					<h2 className="m-0 mt-2 text-4xl line-height-3">HammerByte Users</h2>
				</div>
				<img
					src={emailImage}
					alt="authentication"
					className="w-full max-w-10rem h-auto block mx-auto opacity-90"
					decoding="async"
				/>
				<span className="text-xl font-semibold line-height-3 max-w-28rem">
					Sign in with your email to continue.
				</span>
			</div>
		</div>
	);
}
