import "../shared/styles/global.css";
import "./styles.css";

if (window.location.pathname === "/editor") {
  void import("@/features/editor/hosted/bootstrap");
} else {
  void import("./bootstrap");
}
