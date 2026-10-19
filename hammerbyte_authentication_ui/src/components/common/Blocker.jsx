import imageLoading from "../../assets/icons/loading.gif";

export default function Blocker({
	icon = imageLoading,
	title = "Loading",
	message = "Processing Data",
}) {
	return (
		<div className="h-full w-full flex flex-column align-items-center justify-content-center gap-2">
			<img src={icon} alt={title} className="w-8rem h-8rem" />
			<span className="text-xl text-black-alpha-90">{title}</span>
			<span className="text-color-secondary text-sm">{message}</span>
		</div>
	);
}
