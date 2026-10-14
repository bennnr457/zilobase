import "../styles/global.css";
import "../styles/app.css";

if (window.location.pathname === "/editor") {
  void import("@/features/editor/hosted/bootstrap");
} else {
  void import("./bootstrap");
}
