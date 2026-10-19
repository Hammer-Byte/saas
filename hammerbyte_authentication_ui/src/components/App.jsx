import { Provider } from "react-redux";
import { Wrapper } from "./app/Wrapper";
import AppRoutes from "./app/Routes";
import RequiresConfiguration from "./app/RequiresConfiguration";
import state from "../redux/state";

export default function App() {
	return (
		<Provider store={state}>
			<Wrapper>
				<RequiresConfiguration>
					<AppRoutes />
				</RequiresConfiguration>
			</Wrapper>
		</Provider>
	);
}
