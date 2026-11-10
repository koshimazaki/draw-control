import "./style.css";
import { startApp } from "./app";

startApp(document.getElementById("app")!);

if (import.meta.env.DEV) {
  // Dev-only hook for the smoke script: a generated, licence-clean skinned test character.
  (window as unknown as { __msDev: unknown }).__msDev = () => import("./dev/fixtures");
}
