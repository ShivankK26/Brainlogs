import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Widget } from "./views/Widget";
import "./styles/app.css";

const isWidget = window.location.pathname.startsWith("/widget");

createRoot(document.getElementById("root")!).render(<StrictMode>{isWidget ? <Widget /> : <App />}</StrictMode>);
