import { configureStore } from "@reduxjs/toolkit";
import reducerConfigs from "./sliceConfigs";

const state = configureStore({
	reducer: {
		stateConfigs: reducerConfigs,
	},
});

export default state;
