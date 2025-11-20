// src/main.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css"; // optional

import * as ReactLib from "react";
import * as ReactDOMClient from "react-dom/client";
console.log("📌 React runtime version:", (ReactLib as any).version);
console.log("📌 ReactDOMClient available:", !!ReactDOMClient);


const container = document.getElementById("root");
if (!container) throw new Error("Root container not found in index.html");
createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
