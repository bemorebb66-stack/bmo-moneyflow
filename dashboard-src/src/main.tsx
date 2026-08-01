import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { initializePrivacySafeTelemetry } from "./lib/telemetry";
import "./styles.css";

void initializePrivacySafeTelemetry();
const router = getRouter();
document.head
  .querySelectorAll([
    "title",
    'meta[name="description"]',
    'link[rel="canonical"]',
    'meta[property^="og:"]',
    'meta[name^="twitter:"]',
  ].join(","))
  .forEach((element) => element.remove());
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><RouterProvider router={router} /></React.StrictMode>,
);
