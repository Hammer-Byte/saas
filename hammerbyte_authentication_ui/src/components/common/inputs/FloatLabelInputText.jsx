import { FloatLabel } from "primereact/floatlabel";
import { InputText } from "primereact/inputtext";
import Error from "../Error";

export default function FloatLabelInputText({
	id,
	label,
	value,
	onChange,
	disabled,
	invalid,
	error,
	className = "w-full",
	icon,
	...props
}) {
	return (
		<div className={`flex flex-column gap-1 ${className}`}>
			<div className="p-inputgroup">
				{icon && (
					<span className="p-inputgroup-addon">
						<i className={icon}></i>
					</span>
				)}
				<FloatLabel>
					<InputText
						disabled={disabled}
						invalid={invalid}
						id={id}
						value={value}
						onChange={onChange}
						{...props}
					/>
					<label htmlFor={id}>{label}</label>
				</FloatLabel>
			</div>

			<Error error={error} className="px-2 align-self-end" />
		</div>
	);
}
