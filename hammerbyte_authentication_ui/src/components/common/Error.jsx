export default function Error({ error, className, ...props }) {
	return (
		!!error && (
			<small className={`text-red-500 ${className || ""}`} {...props}>
				{error}
			</small>
		)
	);
}
